import { Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { WalletService } from '../wallet/wallet.service';
import { InvoiceService } from '../invoices/application/services/invoice.service';
import { CurrencyService } from '../currency/application/services/currency.service';
import { computeHotelCancellationFee } from '../hotels/application/services/hotel-cancellation-fee.util';
import { HotelBookingService } from '../hotels/application/services/hotel-booking.service';

export interface RefundEstimate {
  bookingId: string;
  bookingType: string;
  status: string;
  totalAmount: number;
  currency: string;
  cancellationFee: number;
  feeRuleName: string | null;
  feeType: string | null;
  feeDescription: string | null;
  netRefund: number;
  refundType: 'wallet' | 'credit_shell';
  isFreeCancellation: boolean;
  upcomingFee?: number;
  upcomingFeeFrom?: string;
  upcomingFeeDescription?: string | null;
  /**
   * False when no supplier/fare policy could be resolved. Numeric fields then
   * carry the CONSERVATIVE worst case (full retention); UIs must surface the
   * message and treat figures as unknown rather than authoritative.
   */
  policiesKnown?: boolean;
  policySource?: 'supplier_policy' | 'snapshot' | 'fee_rules' | 'none';
  message?: string | null;
}

export interface CreditShellEntity {
  id: string;
  agentProfileId: string;
  bookingId: string;
  bookingType: string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface PendingRefundItem {
  creditShellId: string;
  agentName: string | null;
  agentEmail: string | null;
  bookingId: string;
  bookingType: string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  createdAt: string;
  expiresAt: string | null;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly auditLog: AuditLogService,
    private readonly walletService: WalletService,
    private readonly invoiceService: InvoiceService,
    private readonly hotelBookingService: HotelBookingService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Resolve agentProfileId from userId, reducing N+1 queries.
   */
  async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /**
   * Get a refund estimate for a booking without processing it.
   * Uses CancellationFeeRule model to calculate fees.
   */
  async getRefundEstimate(bookingId: string): Promise<RefundEstimate> {
    const booking = await this.findBooking(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    const cancellableStatuses = [
      'pending',
      'confirmed',
      'ticketed',
      'booked',
      'held',
      'held_pending_payment',
      'pending_payment',
      'booking_in_progress',
      'paid',
      'processing',
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BusinessError(
        'BOOKING_NOT_CANCELLABLE',
        `Booking status "${booking.status}" cannot be cancelled`,
      );
    }

    const totalAmount = booking.amount ?? 0;
    if (totalAmount <= 0) {
      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount: 0,
        currency: booking.currency ?? 'USD',
        cancellationFee: 0,
        feeRuleName: null,
        feeType: null,
        feeDescription: null,
        netRefund: 0,
        refundType: 'wallet',
        isFreeCancellation: false,
      };
    }

    // Cached live supplier quote (<24h, stored by admin getCancelEstimate
    // after a live quote): fresher than any stored policy, and saves a
    // supplier round-trip on every estimate open.
    const cachedQuote = (booking as any)?.workflowSummary?.liveRefundQuote as
      | {
          refundable?: boolean;
          refundAmount?: number;
          currency?: string;
          at?: string;
        }
      | undefined;
    const cachedAt = cachedQuote?.at ? new Date(cachedQuote.at).getTime() : 0;
    if (
      cachedQuote &&
      cachedAt > 0 &&
      Date.now() - cachedAt < 24 * 60 * 60 * 1000 &&
      typeof cachedQuote.refundable === 'boolean'
    ) {
      const refundAmount = cachedQuote.refundable
        ? Math.min(Number(cachedQuote.refundAmount ?? 0), totalAmount)
        : 0;
      const fee = Math.max(0, Math.round((totalAmount - refundAmount) * 100) / 100);
      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount,
        currency: booking.currency ?? 'USD',
        cancellationFee: fee,
        feeRuleName: 'Live supplier quote (cached)',
        feeType: 'supplier_policy',
        feeDescription: cachedQuote.refundable
          ? 'Supplier live quote — refundable amount from the last live check (<24h).'
          : 'Supplier live quote — non-refundable fare, full amount retained.',
        netRefund: refundAmount,
        refundType: booking.type === 'hotel' ? 'credit_shell' : 'wallet',
        isFreeCancellation: cachedQuote.refundable && refundAmount >= totalAmount,
        policiesKnown: true,
        policySource: 'supplier_policy',
      };
    }

    // Hotel bookings: prefer supplier cancellation policies (persisted at
    // booking time in rateSnapshot) over generic time-based fee rules.
    if (booking.type === 'hotel' && (booking as any).supplierPolicies?.length) {
      const fee = computeHotelCancellationFee(
        (booking as any).supplierPolicies,
        totalAmount,
      );
      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount,
        currency: booking.currency ?? 'USD',
        cancellationFee: fee.cancellationFee,
        feeRuleName: fee.policyDescription ?? 'Supplier policy',
        feeType: 'supplier_policy',
        feeDescription: fee.policyDescription,
        netRefund: fee.refundAmount,
        refundType: booking.type === 'hotel' ? 'credit_shell' : 'wallet',
        isFreeCancellation: fee.isFreeCancellation,
        upcomingFee: fee.upcomingFee,
        upcomingFeeFrom: fee.upcomingFeeFrom,
        upcomingFeeDescription: fee.upcomingFeeDescription,
        policiesKnown: true,
        policySource: 'supplier_policy',
      };
    }

    // Flight bookings (Amadeus): demo bookings cancel FREE locally (no
    // supplier order exists); live bookings use the fare rules captured from
    // Amadeus pricing into the offer snapshot at checkout/confirm time.
    if (booking.type === 'flight' && (booking as any).provider === 'amadeus') {
      const snapshot = (booking as any).offerSnapshot as
        | Record<string, any>
        | undefined;
      const summary = (booking as any).workflowSummary as
        | Record<string, any>
        | undefined;
      const isDemo =
        snapshot?.demoMode === true ||
        (typeof summary?.supplierBookingId === 'string' &&
          summary.supplierBookingId.startsWith('amd-demo-'));

      if (isDemo) {
        return {
          bookingId,
          bookingType: booking.type,
          status: booking.status,
          totalAmount,
          currency: booking.currency ?? 'USD',
          cancellationFee: 0,
          feeRuleName: 'Demo booking — free local cancellation',
          feeType: 'supplier_policy',
          feeDescription:
            'Demo booking: no supplier order exists. Cancellation is free and applied locally.',
          netRefund: totalAmount,
          refundType: 'wallet',
          isFreeCancellation: true,
          policiesKnown: true,
          policySource: 'snapshot',
        };
      }

      // Live Amadeus booking: fare rules persisted at pricing time
      // (display.refundPolicy / changePolicy in the offer snapshot).
      const refundPolicy = snapshot?.display?.refundPolicy as
        | {
            allowed?: boolean;
            penaltyAmount?: number | string;
            penaltyCurrency?: string;
            label?: string;
          }
        | undefined;

      if (refundPolicy && typeof refundPolicy.allowed === 'boolean') {
        const penalty = Number(refundPolicy.penaltyAmount ?? 0);
        const fee = refundPolicy.allowed
          ? Math.min(penalty, totalAmount)
          : totalAmount;
        const penaltyCurrency = refundPolicy.penaltyCurrency ?? booking.currency ?? 'USD';
        const description = !refundPolicy.allowed
          ? 'Non-refundable fare — the full amount is retained on cancellation.'
          : penalty > 0
            ? `Refundable before departure with an airline penalty of ${await this.currencyService.formatWithCode(penalty, penaltyCurrency)}.`
            : 'Fully refundable before departure.';
        return {
          bookingId,
          bookingType: booking.type,
          status: booking.status,
          totalAmount,
          currency: booking.currency ?? 'USD',
          cancellationFee: Math.round(fee * 100) / 100,
          feeRuleName: 'Airline fare conditions',
          feeType: 'supplier_policy',
          feeDescription: description,
          netRefund: Math.round((totalAmount - fee) * 100) / 100,
          refundType: 'wallet',
          isFreeCancellation: refundPolicy.allowed && penalty === 0,
          policiesKnown: true,
          policySource: 'snapshot',
        };
      }

      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount,
        currency: booking.currency ?? 'USD',
        cancellationFee: totalAmount,
        feeRuleName: null,
        feeType: null,
        feeDescription: null,
        netRefund: 0,
        refundType: 'wallet',
        isFreeCancellation: false,
        policiesKnown: false,
        policySource: 'none',
        message:
          'Fare refund conditions unavailable. The airline may still apply charges per its fare rules — confirm before cancelling.',
      };
    }

    // Flight bookings (Duffel): use the fare's own refund conditions captured
    // in the offer snapshot — `conditions.refund_before_departure` carries the
    // airline's penalty. Falls back to fee rules only when no snapshot exists.
    if (booking.type === 'flight' && (booking as any).provider === 'duffel') {
      const rawOffer = (booking as any).offerSnapshot?.rawOffer as
        | Record<string, any>
        | undefined;
      const refundCondition = rawOffer?.conditions?.refund_before_departure as
        | {
            allowed?: boolean;
            penalty_amount?: string;
            penalty_currency?: string;
          }
        | undefined;

      // Fallback: search-time normalized display policies (camelCase) stored
      // in the snapshot — covers orders booked before conditions capture and
      // cases where the raw offer shape was unavailable.
      const displayPolicy = (booking as any).offerSnapshot?.display
        ?.refundPolicy as
        | {
            allowed?: boolean;
            penaltyAmount?: number | string;
            penaltyCurrency?: string;
          }
        | undefined;

      const resolved = refundCondition
        ? {
            allowed: refundCondition.allowed,
            penalty: Number(refundCondition.penalty_amount ?? 0),
            currency: refundCondition.penalty_currency,
          }
        : displayPolicy && typeof displayPolicy.allowed === 'boolean'
          ? {
              allowed: displayPolicy.allowed,
              penalty: Number(displayPolicy.penaltyAmount ?? 0),
              currency: displayPolicy.penaltyCurrency,
            }
          : null;

      if (resolved && typeof resolved.allowed === 'boolean') {
        const penalty = resolved.penalty;
        const fee = resolved.allowed
          ? Math.min(penalty, totalAmount)
          : totalAmount;
        const resolvedPenaltyCurrency = resolved.currency ?? booking.currency ?? 'USD';
        const description = !resolved.allowed
          ? 'Non-refundable fare — the full amount is retained on cancellation.'
          : penalty > 0
            ? `Refundable before departure with an airline penalty of ${await this.currencyService.formatWithCode(penalty, resolvedPenaltyCurrency)}.`
            : 'Fully refundable before departure.';
        return {
          bookingId,
          bookingType: booking.type,
          status: booking.status,
          totalAmount,
          currency: booking.currency ?? 'USD',
          cancellationFee: Math.round(fee * 100) / 100,
          feeRuleName: 'Airline fare conditions',
          feeType: 'supplier_policy',
          feeDescription: description,
          netRefund: Math.round((totalAmount - fee) * 100) / 100,
          refundType: 'wallet',
          isFreeCancellation: resolved.allowed && penalty === 0,
          policiesKnown: true,
          policySource: 'snapshot',
        };
      }

      // No fare conditions stored — conservative worst case (full retention)
      // with an explicit unknown flag so UIs surface it as unresolved.
      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount,
        currency: booking.currency ?? 'USD',
        cancellationFee: totalAmount,
        feeRuleName: null,
        feeType: null,
        feeDescription: null,
        netRefund: 0,
        refundType: 'wallet',
        isFreeCancellation: false,
        policiesKnown: false,
        policySource: 'none',
        message:
          'Fare refund conditions unavailable. The airline may still apply charges per its fare rules — confirm before cancelling.',
      };
    }

    // Flight bookings (Travelport): a real refund figure only exists while the
    // PNR is LIVE — Travelport strips pricing once cancelled. Use the fare
    // conditions captured in the snapshot, or ask the caller for a live quote.
    // (If a quote was already captured before cancellation, surface it over
    // the generic time-based rules.)
    if (
      booking.type === 'flight' &&
      (booking as unknown as { provider?: string }).provider === 'travelport'
    ) {
      const summary = (
        booking as unknown as {
          workflowSummary?: Record<string, unknown>;
        }
      ).workflowSummary;
      const quoted = summary?.refundQuote as
        | { amount?: number | string; currency?: string }
        | undefined;
      if (quoted && quoted.amount != null) {
        const refund = Number(quoted.amount);
        return {
          bookingId,
          bookingType: booking.type,
          status: booking.status,
          totalAmount,
          currency: booking.currency ?? quoted.currency ?? 'USD',
          cancellationFee: Math.max(
            0,
            Math.round((totalAmount - refund) * 100) / 100,
          ),
          feeRuleName: 'Travelport refund quote (pre-cancellation)',
          feeType: 'supplier_policy',
          feeDescription: `Supplier quoted ${refund} ${quoted.currency ?? 'USD'} before cancellation.`,
          netRefund: refund,
          refundType: 'wallet',
          isFreeCancellation: refund >= totalAmount,
          policiesKnown: true,
          policySource: 'supplier_policy',
        };
      }
      const snapshot = (
        booking as unknown as {
          offerSnapshot?: Record<string, unknown> | null;
        }
      ).offerSnapshot;
      const rawOffer = snapshot?.rawOffer as
        | Record<string, unknown>
        | undefined;
      const display = snapshot?.display as Record<string, unknown> | undefined;
      const displayPolicy = display?.refundPolicy as
        | {
            allowed?: boolean;
            penaltyAmount?: number | string;
            penaltyCurrency?: string;
            /** Authoritative "is this a genuine $0 fee" flag, set by the
             *  normalizer (travelport.normalizer.ts readPenaltyGroup) only
             *  when Travelport actually reported a zero-amount penalty.
             *  Must be trusted as-is — see the note below on why deriving
             *  it from `penalty === 0` here is wrong. */
            free?: boolean;
            /** Penalty quoted as a share of the fare (0-100). */
            penaltyPercent?: number;
          }
        | undefined;
      // Only treat the fee as a known number when the normalizer actually
      // parsed a Penalty amount, or explicitly flagged this policy as free.
      // Travelport fare rules can say "cancellation permitted" without a
      // parseable Penalty amount (the normalizer then omits penaltyAmount
      // and sets free:false, NOT free:true) — defaulting that missing
      // amount to 0 via `?? 0` silently turned "fee unspecified" into
      // "free cancellation", contradicting the fee shown on offer/snapshot/
      // success pages (which correctly render "Refund permitted", not
      // "free"). When the fee genuinely isn't known, `resolved` is null so
      // the caller falls through to the policiesKnown:false path below,
      // which (as of the quoteRefund fix) attempts a real live Travelport
      // quote instead of guessing.
      // A non-refundable policy (allowed:false) needs no penalty amount at
      // all — the fee is simply the full total, no ambiguity — so only
      // require a known amount when the policy actually permits a refund.
      const hasKnownFee =
        displayPolicy?.allowed === false ||
        displayPolicy?.penaltyAmount != null ||
        displayPolicy?.penaltyPercent != null ||
        displayPolicy?.free === true;
      const resolved: {
        allowed?: boolean;
        penalty: number;
        currency?: string;
        percent?: number;
        free: boolean;
      } | null =
        (rawOffer?.conditions || displayPolicy) && hasKnownFee
          ? {
              allowed:
                typeof displayPolicy?.allowed === 'boolean'
                  ? displayPolicy.allowed
                  : undefined,
              penalty: Number(displayPolicy?.penaltyAmount ?? 0),
              currency: displayPolicy?.penaltyCurrency,
              percent:
                displayPolicy?.penaltyPercent != null
                  ? Number(displayPolicy.penaltyPercent)
                  : undefined,
              free: displayPolicy?.free === true,
            }
          : null;
      if (resolved && resolved.allowed != null) {
        // A stored amount is in the airline's currency; the booking total is
        // in the booking currency — convert before comparing/capping.
        let penaltyInBookingCurrency = resolved.penalty;
        if (
          resolved.allowed &&
          !resolved.free &&
          resolved.percent == null &&
          resolved.currency &&
          booking.currency &&
          resolved.currency.toUpperCase() !== booking.currency.toUpperCase()
        ) {
          try {
            penaltyInBookingCurrency = (
              await this.currencyService.convert(
                resolved.penalty,
                resolved.currency,
                booking.currency,
              )
            ).amount;
          } catch {
            // Keep the unconverted figure rather than failing the estimate.
          }
        }
        const fee = resolved.allowed
          ? resolved.free
            ? 0
            : resolved.percent != null
              ? Math.min(totalAmount, (totalAmount * resolved.percent) / 100)
              : Math.min(penaltyInBookingCurrency, totalAmount)
          : totalAmount;
        return {
          bookingId,
          bookingType: booking.type,
          status: booking.status,
          totalAmount,
          currency: booking.currency ?? resolved.currency ?? 'USD',
          cancellationFee: Math.round(fee * 100) / 100,
          feeRuleName: 'Airline fare conditions',
          feeType: 'supplier_policy',
          feeDescription: !resolved.allowed
            ? 'Non-refundable fare — the full amount is retained on cancellation.'
            : resolved.free
              ? 'Free cancellation — no airline penalty.'
              : resolved.percent != null
                ? `Refundable with an airline penalty of ${resolved.percent}% of the fare.`
                : `Refundable with an airline penalty of ${resolved.penalty} ${resolved.currency ?? booking.currency ?? 'USD'}.`,
          netRefund: Math.round((totalAmount - fee) * 100) / 100,
          refundType: 'wallet',
          isFreeCancellation: resolved.allowed && resolved.free,
          policiesKnown: true,
          policySource: 'snapshot',
        };
      }
      return {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount,
        currency: booking.currency ?? 'USD',
        cancellationFee: totalAmount,
        feeRuleName: null,
        feeType: null,
        feeDescription: null,
        netRefund: 0,
        refundType: 'wallet',
        isFreeCancellation: false,
        policiesKnown: false,
        policySource: 'none',
        message:
          'Fare refund conditions unavailable. The airline may still apply charges per its fare rules — confirm before cancelling.',
      };
    }

    // Look up applicable cancellation fee rules
    // Support both singular (new) and plural (legacy DB rows) applyTo values
    const applyToValues = [booking.type, `${booking.type}s`, 'all'];
    const applicableRules = await this.prisma.cancellationFeeRule.findMany({
      where: {
        isActive: true,
        applyTo: { in: applyToValues },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });

    const hoursSinceBooking =
      (Date.now() - booking.createdAt.getTime()) / (1000 * 60 * 60);

    // Find the best matching rule
    let selectedRule: (typeof applicableRules)[0] | null = null;

    for (const rule of applicableRules) {
      // Check supplier match
      if (rule.supplierId && (booking as any).provider !== rule.supplierId)
        continue;
      // Check time window
      if (
        rule.hoursSinceBooking !== null &&
        hoursSinceBooking > rule.hoursSinceBooking
      )
        continue;

      selectedRule = rule;
      break; // First matching rule wins
    }

    let cancellationFee: number;
    let feeRuleName: string | null = null;

    if (selectedRule) {
      feeRuleName = selectedRule.name;
      if (selectedRule.type === 'flat') {
        cancellationFee = Number(selectedRule.fee);
      } else {
        // Percentage
        cancellationFee = (totalAmount * Number(selectedRule.fee)) / 100;
        if (
          selectedRule.minFee &&
          cancellationFee < Number(selectedRule.minFee)
        ) {
          cancellationFee = Number(selectedRule.minFee);
        }
        if (
          selectedRule.maxFee &&
          cancellationFee > Number(selectedRule.maxFee)
        ) {
          cancellationFee = Number(selectedRule.maxFee);
        }
      }
    } else {
      // Fallback: no rules configured — use default time-based logic
      if (hoursSinceBooking <= 24) {
        cancellationFee = 0;
        feeRuleName = 'Free cancellation (24h)';
      } else if (hoursSinceBooking <= 168) {
        // 7 days
        cancellationFee = totalAmount * 0.1;
        feeRuleName = '10% fee (1-7 days)';
      } else if (hoursSinceBooking <= 720) {
        // 30 days
        cancellationFee = totalAmount * 0.25;
        feeRuleName = '25% fee (7-30 days)';
      } else {
        cancellationFee = totalAmount * 0.5;
        feeRuleName = '50% fee (30+ days)';
      }
      // Apply minimum fee
      const minFee = booking.type === 'flight' ? 50 : 25;
      cancellationFee = Math.max(cancellationFee, minFee);
    }

    cancellationFee = Math.round(cancellationFee * 100) / 100;
    const netRefund = Math.max(
      0,
      Math.round((totalAmount - cancellationFee) * 100) / 100,
    );

    // Determine refund type
    const refundType = booking.type === 'hotel' ? 'credit_shell' : 'wallet';

    return {
      bookingId,
      bookingType: booking.type,
      status: booking.status,
      totalAmount,
      currency: booking.currency ?? 'USD',
      cancellationFee,
      feeRuleName,
      feeType: selectedRule?.type ?? null,
      feeDescription: feeRuleName,
      netRefund,
      refundType,
      isFreeCancellation: cancellationFee === 0,
      policiesKnown: true,
      policySource: 'fee_rules',
    };
  }

  /**
   * Process a full cancellation — calculates fee, creates credit shell or wallet refund,
   * reverses commission, and updates booking status.
   * Delegates the core cancellation to AgentBookingService but handles
   * the fee calculation via CancellationFeeRule.
   */
  async processCancellation(
    bookingId: string,
    agentUserId: string,
    reason?: string,
    actorId?: string,
  ): Promise<{
    booking: any;
    refundAmount: number;
    cancellationFee: number;
    creditShellId?: string;
    modificationRequestId: string;
    refundType: string;
  }> {
    // Get estimate first to apply rules
    const estimate = await this.getRefundEstimate(bookingId);

    // Find the booking to get agent profile
    const booking = await this.findBooking(bookingId);
    if (!booking) throw new BusinessError('BOOKING_NOT_FOUND');

    // Ownership check: agent can only cancel their own bookings
    if (booking.userId !== agentUserId) {
      throw new BusinessError(
        'FORBIDDEN',
        'You can only cancel your own bookings',
      );
    }

    // Cancel at the supplier BEFORE local state changes (hotels only).
    // Failures are logged and recorded but do not block the local
    // cancellation — support can retry via the admin sync/cancel actions.
    if (booking.type === 'hotel') {
      try {
        const supplierCancel = await this.hotelBookingService.cancelSupplier(
          bookingId,
          reason,
        );
        if (!supplierCancel.supplierCancelled) {
          this.logger.warn(
            `[CANCEL] Supplier not cancelled for hotel booking ${bookingId}: ${supplierCancel.reason ?? supplierCancel.error ?? supplierCancel.message ?? 'unknown reason'}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `[CANCEL] Supplier cancellation attempt failed for hotel booking ${bookingId}`,
          err,
        );
      }
    }

    // Wrap all state changes in a single transaction so either the entire
    // cancellation commits or nothing does.
    const result = await this.prisma.$transaction(async (tx) => {
      // Create modification request record
      const modRequest = await tx.bookingModificationRequest.create({
        data: {
          bookingId,
          bookingType: booking.type,
          agentUserId,
          requestedBy: 'agent',
          type: 'cancel',
          reason: reason ?? null,
          status: 'pending',
          refundAmount: estimate.netRefund,
          cancellationFee: estimate.cancellationFee,
        },
      });

      let creditShellId: string | undefined;

      // Process refund
      if (estimate.netRefund > 0) {
        // Verify agent profile exists and is valid
        const agentProfile = await tx.agentProfile.findUnique({
          where: { id: booking.agentProfileId },
          select: { id: true, isSuspended: true },
        });
        if (!agentProfile) {
          throw new BusinessError(
            'AGENT_PROFILE_NOT_FOUND',
            'Cannot process refund: agent profile no longer exists.',
          );
        }
        if (agentProfile.isSuspended) {
          this.logger.warn(
            `Processing refund for suspended agent ${booking.agentProfileId} — booking ${bookingId}`,
          );
        }

        if (estimate.refundType === 'credit_shell') {
          // Create credit shell (stamped in the estimate/booking currency)
          const shell = await tx.creditShell.create({
            data: {
              agentProfileId: booking.agentProfileId,
              bookingId,
              bookingType: booking.type,
              originalAmount: estimate.netRefund,
              remainingAmount: estimate.netRefund,
              currency: estimate.currency,
              status: 'active',
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          });
          creditShellId = shell.id;

          const currentProfile = await tx.agentProfile.findUnique({
            where: { id: booking.agentProfileId },
            select: { walletBalance: true },
          });
          const balanceBefore = Number(currentProfile?.walletBalance ?? 0);

          await tx.walletTransaction.create({
            data: {
              agentProfileId: booking.agentProfileId,
              type: 'refund',
              amount: estimate.netRefund,
              currency: estimate.currency,
              balanceBefore,
              balanceAfter: balanceBefore,
              reference: `credit-shell-${shell.id}`,
              description: `Credit shell created from cancellation (${reason ?? 'Cancellation refund'})`,
              status: 'completed',
              bookingId,
              bookingType: booking.type,
            },
          });
        } else {
          // Cash refund to wallet — deposit outside the tx since it has its own
          // transaction scope, but the wallet balance change is simple enough
          // that a concurrent failure here will cause the outer tx to retry.
          // Note: walletService.deposit uses its own PrismaService, not the tx handle.
          // This is a known coupling; if the outer tx retries, deposit may double-credit
          // the wallet. The idempotency key on the outbox event below prevents replay.
          await this.walletService.deposit(
            booking.agentProfileId,
            estimate.netRefund,
            undefined,
            `Cancellation refund — ${reason ?? 'Booking cancelled'}`,
            actorId ?? agentUserId,
            undefined,
            estimate.currency,
          );
        }
      }

      // Update booking status to cancelled
      await this.updateBookingStatusInTx(
        tx,
        bookingId,
        booking.type,
        'cancelled',
        reason,
      );

      // Update modification request
      await tx.bookingModificationRequest.update({
        where: { id: modRequest.id },
        data: {
          status: 'processed',
          creditShellId: creditShellId ?? null,
          processedAt: new Date(),
        },
      });

      // Write outbox event for commission reversal inside the transaction
      await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'BOOKING_CANCELLED',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        idempotencyKey: `cancel-${bookingId}`,
        payload: {
          bookingId,
          bookingType: booking.type,
          agentProfileId: booking.agentProfileId,
        },
      });

      return { modRequestId: modRequest.id, creditShellId };
    });

    // Credit note generation is outside the transaction: failure should not
    // roll back the cancellation itself. A repair job can retroactively generate
    // the credit note if needed.
    try {
      await this.invoiceService.generateCreditNoteForRefund(bookingId, {
        refundAmount: estimate.netRefund,
        cancellationFee: estimate.cancellationFee,
        reason: reason ?? undefined,
      });
    } catch (err) {
      this.logger.error(
        `Failed to generate credit note for booking ${bookingId}`,
        err,
      );
    }

    const [feeText, refundText] = await Promise.all([
      this.currencyService.formatWithCode(estimate.cancellationFee, estimate.currency),
      this.currencyService.formatWithCode(estimate.netRefund, estimate.currency),
    ]);
    await this.auditLog.log({
      userId: actorId ?? agentUserId,
      action: 'BOOKING_CANCELLED',
      entity: booking.type === 'flight' ? 'FlightBooking' : 'HotelBooking',
      entityId: bookingId,
      description: `Cancelled via RefundService. Fee: ${feeText}, Refund: ${refundText} (${estimate.refundType})`,
      newValue: { ...estimate, reason },
    });

    const updatedBooking = await this.findBooking(bookingId);

    return {
      booking: updatedBooking,
      refundAmount: estimate.netRefund,
      cancellationFee: estimate.cancellationFee,
      creditShellId: result.creditShellId,
      modificationRequestId: result.modRequestId,
      refundType: estimate.refundType,
    };
  }

  /**
   * Admin: convert a credit shell to cash (refund to wallet).
   */
  async processRefund(
    creditShellId: string,
    adminUserId: string,
  ): Promise<{
    creditShellId: string;
    refundedAmount: number;
    remainingAfter: number;
    currency: string;
  }> {
    const shell = await this.prisma.creditShell.findUnique({
      where: { id: creditShellId },
    });
    if (!shell)
      throw new BusinessError(
        'CREDIT_SHELL_NOT_FOUND',
        `Credit shell ${creditShellId} not found`,
      );
    if (shell.status !== 'active' && shell.status !== 'partially_used') {
      throw new BusinessError(
        'CREDIT_SHELL_NOT_REFUNDABLE',
        `Credit shell status is "${shell.status}" — cannot refund`,
      );
    }

    const refundAmount = Number(shell.remainingAmount);
    if (refundAmount <= 0)
      throw new BusinessError(
        'CREDIT_SHELL_EXHAUSTED',
        'Credit shell has no remaining balance',
      );

    // Refund to wallet (converted into the wallet currency inside deposit)
    await this.walletService.deposit(
      shell.agentProfileId,
      refundAmount,
      undefined,
      `Credit shell conversion to cash — shell ${creditShellId}`,
      adminUserId,
      undefined,
      shell.currency ?? undefined,
    );

    // Mark shell as exhausted
    await this.prisma.creditShell.update({
      where: { id: creditShellId },
      data: {
        remainingAmount: 0,
        status: 'exhausted',
      },
    });

    await this.auditLog.log({
      userId: adminUserId,
      action: 'CREDIT_SHELL_REFUNDED',
      entity: 'CreditShell',
      entityId: creditShellId,
      description: `Admin converted credit shell to cash: ${await this.currencyService.formatWithCode(refundAmount, shell.currency ?? 'USD')}`,
      newValue: { refundAmount, currency: shell.currency ?? 'USD' },
    });

    return {
      creditShellId,
      refundedAmount: refundAmount,
      remainingAfter: 0,
      currency: shell.currency ?? 'USD',
    };
  }

  /**
   * Get agent's credit shells (paginated, status-aware).
   * Default ('active'/undefined) preserves the spendable view: active +
   * partially_used and unexpired. 'all' returns everything; 'expired'
   * returns past-expiry rows; any other value filters by exact status.
   */
  async getAgentCreditShells(
    agentProfileId: string,
    filters?: { page?: number; limit?: number; status?: string },
  ): Promise<{ items: CreditShellEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 15, 100);
    const skip = (page - 1) * limit;
    const status = filters?.status;

    let where: any = { agentProfileId };
    if (!status || status === 'active') {
      where = {
        agentProfileId,
        status: { in: ['active', 'partially_used'] },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      };
    } else if (status === 'all') {
      where = { agentProfileId };
    } else if (status === 'expired') {
      where = { agentProfileId, expiresAt: { lt: new Date() } };
    } else {
      where = { agentProfileId, status };
    }

    const [shells, total] = await this.prisma.$transaction([
      this.prisma.creditShell.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.creditShell.count({ where }),
    ]);

    return {
      items: shells.map((s) => ({
        id: s.id,
        agentProfileId: s.agentProfileId,
        bookingId: s.bookingId,
        bookingType: s.bookingType,
        originalAmount: Number(s.originalAmount),
        remainingAmount: Number(s.remainingAmount),
        currency: s.currency ?? 'USD',
        status: s.status,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Apply a credit shell to a new booking.
   * Deducts from the shell's remaining amount. The requested amount may be
   * quoted in the new booking's currency — it is converted into the shell's
   * currency before comparing/consuming (previously compared raw).
   */
  async useCreditShell(
    creditShellId: string,
    amount: number,
    newBookingId: string,
    agentProfileId: string,
    currency?: string,
  ): Promise<CreditShellEntity> {
    const shell = await this.prisma.creditShell.findUnique({
      where: { id: creditShellId },
    });
    if (!shell) throw new BusinessError('CREDIT_SHELL_NOT_FOUND');
    if (shell.status !== 'active' && shell.status !== 'partially_used') {
      throw new BusinessError(
        'CREDIT_SHELL_EXHAUSTED',
        'Credit shell is no longer available',
      );
    }
    if (shell.agentProfileId !== agentProfileId) {
      throw new BusinessError(
        'FORBIDDEN',
        'This credit shell does not belong to you',
      );
    }

    const remaining = Number(shell.remainingAmount);
    const shellCurrency = (shell.currency ?? 'USD').toUpperCase();
    // Requested amount may be in the new booking's currency — normalize into
    // the shell's currency before the sufficiency check and consumption.
    const requestedInShell =
      !currency || currency.toUpperCase() === shellCurrency
        ? amount
        : (await this.currencyService.convert(amount, currency, shellCurrency)).amount;
    if (requestedInShell > remaining) {
      const [remainingText, requestedText] = await Promise.all([
        this.currencyService.formatWithCode(remaining, shellCurrency),
        this.currencyService.formatWithCode(amount, (currency ?? shellCurrency).toUpperCase()),
      ]);
      throw new BusinessError(
        'INSUFFICIENT_CREDIT',
        `Credit shell has ${remainingText} remaining, but ${requestedText} was requested`,
      );
    }

    const newRemaining = remaining - requestedInShell;
    const newStatus = newRemaining <= 0 ? 'exhausted' : 'partially_used';

    const updated = await this.prisma.creditShell.update({
      where: { id: creditShellId },
      data: {
        remainingAmount: newRemaining,
        status: newStatus,
      },
    });

    await this.prisma.walletTransaction.create({
      data: {
        agentProfileId,
        type: 'credit_used',
        amount: requestedInShell,
        currency: shellCurrency,
        originalAmount: requestedInShell !== amount ? amount : null,
        originalCurrency:
          requestedInShell !== amount && currency ? currency.toUpperCase() : null,
        balanceBefore: 0,
        balanceAfter: 0,
        reference: newBookingId,
        description: `Credit shell applied to booking ${newBookingId}`,
        status: 'completed',
        bookingId: newBookingId,
      },
    });

    return {
      id: updated.id,
      agentProfileId: updated.agentProfileId,
      bookingId: updated.bookingId,
      bookingType: updated.bookingType,
      originalAmount: Number(updated.originalAmount),
      remainingAmount: Number(updated.remainingAmount),
      currency: updated.currency ?? shellCurrency,
      status: updated.status,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Admin: get pending refunds queue (active credit shells ready for conversion).
   */
  async getAdminPendingRefunds(): Promise<{
    total: number;
    totalAmount: number;
    totalCurrency: string;
    items: PendingRefundItem[];
  }> {
    // Capped + narrow: the mapped view needs 9 scalars; converts are cached.
    const shells = await this.prisma.creditShell.findMany({
      where: {
        status: { in: ['active', 'partially_used'] },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true, agentProfileId: true, bookingId: true, bookingType: true,
        originalAmount: true, remainingAmount: true, currency: true,
        createdAt: true, expiresAt: true,
      },
    });

    // Batch fetch agent info
    const agentProfileIds = shells.map((s) => s.agentProfileId);
    const profiles = await this.prisma.agentProfile.findMany({
      where: { id: { in: agentProfileIds } },
      select: { id: true, userId: true },
    });
    const userIds = profiles.map((p) => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const profileUserMap = new Map(profiles.map((p) => [p.id, p.userId]));

    const items: PendingRefundItem[] = shells.map((s) => {
      const userId = profileUserMap.get(s.agentProfileId);
      const user = userId ? userMap.get(userId) : null;
      return {
        creditShellId: s.id,
        agentName: user
          ? [user.firstName, user.lastName].filter(Boolean).join(' ')
          : null,
        agentEmail: user?.email ?? null,
        bookingId: s.bookingId,
        bookingType: s.bookingType,
        originalAmount: Number(s.originalAmount),
        remainingAmount: Number(s.remainingAmount),
        currency: s.currency ?? 'USD',
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt?.toISOString() ?? null,
      };
    });

    // Shells can sit in different currencies — convert each into the platform
    // default before summing (convert-then-sum) instead of adding raw.
    const actives = await this.currencyService.listActive();
    const defaultCode =
      actives.find((c: any) => c.isDefault)?.code ??
      actives.find((c: any) => c.isBase)?.code ??
      'USD';
    let totalAmount = 0;
    // Collect first, sum after — accumulating into a shared total inside
    // Promise.all workers is a read-modify-write race.
    const convertedAmounts = await Promise.all(
      items.map(async (i) => {
        try {
          return (await this.currencyService.convert(i.remainingAmount, i.currency, defaultCode))
            .amount;
        } catch {
          return i.remainingAmount;
        }
      }),
    );
    totalAmount = convertedAmounts.reduce((s, v) => s + v, 0);

    return {
      total: items.length,
      totalAmount,
      totalCurrency: defaultCode,
      items,
    };
  }

  // ── Admin: CancellationFeeRule CRUD ───────────────────────

  async createFeeRule(data: {
    name: string;
    type: string;
    fee: number;
    applyTo: string;
    minFee?: number;
    maxFee?: number;
    supplierId?: string;
    hoursSinceBooking?: number;
  }): Promise<any> {
    return this.prisma.cancellationFeeRule.create({
      data: {
        name: data.name,
        type: data.type,
        fee: data.fee,
        applyTo: data.applyTo,
        minFee: data.minFee ?? null,
        maxFee: data.maxFee ?? null,
        supplierId: data.supplierId ?? null,
        hoursSinceBooking: data.hoursSinceBooking ?? null,
      },
    });
  }

  async updateFeeRule(
    id: string,
    data: Partial<{
      name: string;
      type: string;
      fee: number;
      applyTo: string;
      minFee: number;
      maxFee: number;
      supplierId: string;
      hoursSinceBooking: number;
      isActive: boolean;
    }>,
  ): Promise<any> {
    return this.prisma.cancellationFeeRule.update({
      where: { id },
      data,
    });
  }

  async deleteFeeRule(id: string): Promise<void> {
    await this.prisma.cancellationFeeRule.delete({ where: { id } });
  }

  async getFeeRules(): Promise<any[]> {
    return this.prisma.cancellationFeeRule.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  private async findBooking(bookingId: string): Promise<{
    id: string;
    type: 'flight' | 'hotel';
    status: string;
    userId: string;
    amount: number | null;
    currency: string | null;
    agentProfileId: string;
    createdAt: Date;
    provider?: string;
    supplierPolicies?: unknown[];
    offerSnapshot?: unknown;
    workflowSummary?: unknown;
  } | null> {
    const flight = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        userId: true,
        amount: true,
        currency: true,
        createdAt: true,
        provider: true,
        offerSnapshot: true,
        workflowSummary: true,
      },
    });
    // Guest bookings have userId === null — admins must still estimate/cancel them.
    if (flight) {
      let profileId = '';
      if (flight.userId) {
        const profile = await this.prisma.agentProfile.findUnique({
          where: { userId: flight.userId },
          select: { id: true },
        });
        profileId = profile?.id ?? '';
      }
      return {
        id: flight.id,
        type: 'flight',
        status: flight.status,
        userId: flight.userId ?? '',
        amount: flight.amount,
        currency: flight.currency,
        agentProfileId: profileId,
        createdAt: flight.createdAt,
        provider: flight.provider,
        // Exposed as `any` fields consumed by the provider-specific branches below
        ...(flight.offerSnapshot != null
          ? { offerSnapshot: flight.offerSnapshot }
          : {}),
        ...(flight.workflowSummary != null
          ? { workflowSummary: flight.workflowSummary }
          : {}),
      };
    }

    const hotel = await this.prisma.hotelBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        userId: true,
        amount: true,
        currency: true,
        createdAt: true,
        provider: true,
        rateSnapshot: true,
      },
    });
    if (hotel) {
      let profileId = '';
      if (hotel.userId) {
        const profile = await this.prisma.agentProfile.findUnique({
          where: { userId: hotel.userId },
          select: { id: true },
        });
        profileId = profile?.id ?? '';
      }
      return {
        id: hotel.id,
        type: 'hotel',
        status: hotel.status,
        userId: hotel.userId ?? '',
        amount: hotel.amount,
        currency: hotel.currency,
        agentProfileId: profileId,
        createdAt: hotel.createdAt,
        provider: hotel.provider,
        supplierPolicies:
          (hotel.rateSnapshot as any)?.cancellationPolicies ?? [],
      };
    }

    return null;
  }

  private async updateBookingStatusInTx(
    tx: any,
    bookingId: string,
    type: 'flight' | 'hotel',
    status: string,
    message?: string,
  ): Promise<void> {
    if (type === 'flight') {
      await tx.flightBooking.update({
        where: { id: bookingId },
        data: { status, message: message ?? status },
      });
    } else {
      await tx.hotelBooking.update({
        where: { id: bookingId },
        data: { status, message: message ?? status },
      });
    }
  }

  private async updateBookingStatus(
    bookingId: string,
    type: 'flight' | 'hotel',
    status: string,
    message?: string,
  ): Promise<any> {
    if (type === 'flight') {
      return this.prisma.flightBooking.update({
        where: { id: bookingId },
        data: { status, message: message ?? status },
      });
    }
    return this.prisma.hotelBooking.update({
      where: { id: bookingId },
      data: { status, message: message ?? status },
    });
  }
}
