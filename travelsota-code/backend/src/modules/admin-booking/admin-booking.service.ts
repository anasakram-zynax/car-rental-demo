import { Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { AgentBookingService } from '../agent-booking/agent-booking.service';
import { RefundService } from '../refund/refund.service';
import { FlightBookingProviderRegistryService } from '../flights/application/services/flight-booking-provider-registry.service';
import { FlightBookingPublicService } from '../flights/application/services/flight-booking-public.service';
import { HotelBookingService } from '../hotels/application/services/hotel-booking.service';
import { NotificationService } from '../notifications/application/notification.service';
import { PaymentRepository } from '../payment/domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../payment/application/services/payment-orchestrator.service';
import { PaymentStatus } from '../payment/domain/enums/payment-status.enum';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { randomUUID } from 'node:crypto';
import type { FlightsProviderKey } from '../settings/domain/provider-config.entity';
import { isFakeBooking } from '../../shared/booking/demo-booking-fallback.util';

const toFlightsProviderKey = (
  value: string | null | undefined,
): FlightsProviderKey =>
  value === 'travelport' ||
  value === 'duffel' ||
  value === 'amadeus' ||
  value === 'manual'
    ? value
    : 'duffel';

export interface AgentBookingFeedFilters {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  agentId?: string;
}

export interface AgentBookingFeedItem {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  supplierStatus?: string | null;
  agent: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  from?: string;
  to?: string;
  passengerName?: string;
  createdAt: string;
}

export interface PaginatedAgentBookingFeed {
  items: AgentBookingFeedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BookingFinancialSummary {
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  refundedAmount: number;
  cancellationFee: number;
  walletTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
  commissionRecords: Array<{
    id: string;
    commissionAmount: number;
    rate: number;
    rateType: string;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  modificationHistory: Array<{
    id: string;
    type: string;
    status: string;
    reason: string | null;
    refundAmount: number | null;
    cancellationFee: number | null;
    creditShellId: string | null;
    createdAt: string;
  }>;
  creditShells: Array<{
    id: string;
    originalAmount: number;
    remainingAmount: number;
    status: string;
    expiresAt: string | null;
  }>;
}

@Injectable()
export class AdminBookingService {
  private readonly logger = new Logger(AdminBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly agentBookingService: AgentBookingService,
    private readonly refundService: RefundService,
    private readonly flightBookingRegistry: FlightBookingProviderRegistryService,
    private readonly flightBookingService: FlightBookingPublicService,
    private readonly notifications: NotificationService,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly hotelBookingService: HotelBookingService,
  ) {}

  /**
   * Get a real-time feed of all agent bookings (flight + hotel unified).
   * Supports filtering by status, type, date range, free-text search, and agent.
   */
  async getAgentBookingFeed(
    filters?: AgentBookingFeedFilters,
  ): Promise<PaginatedAgentBookingFeed> {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // Common date filter
    const dateFilter: any = {};
    if (filters?.fromDate || filters?.toDate) {
      if (filters.fromDate) dateFilter.gte = new Date(filters.fromDate);
      if (filters.toDate) dateFilter.lte = new Date(filters.toDate);
    }

    // Build where clauses
    const flightWhere: any = {};
    const hotelWhere: any = {};

    if (Object.keys(dateFilter).length > 0) {
      flightWhere.createdAt = dateFilter;
      hotelWhere.createdAt = dateFilter;
    }
    if (filters?.status) {
      flightWhere.status = filters.status;
      hotelWhere.status = filters.status;
    }
    if (filters?.search) {
      const s = filters.search;
      // Refs + agent email (the toolbar placeholder promises "ref or agent").
      flightWhere.OR = [
        { locatorCode: { contains: s, mode: 'insensitive' } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
      ];
      // Search across both provider-neutral and legacy fields for backward compatibility
      hotelWhere.OR = [
        { supplierReference: { contains: s, mode: 'insensitive' } },
        { hotelbedsRef: { contains: s, mode: 'insensitive' } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
      ];
    }
    if (filters?.agentId) {
      flightWhere.userId = filters.agentId;
      hotelWhere.userId = filters.agentId;
    }

    // Windowed merge: fetch (skip + limit) NARROW rows per table — never full
    // blobs — then slice the merged page. The previous version skipped per
    // table and sliced from zero, so deep pages returned the wrong rows.
    const take = skip + limit;
    const [flights, hotels] = await Promise.all([
      filters?.type !== 'hotel'
        ? this.prisma.flightBooking.findMany({
            where: flightWhere,
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              id: true,
              status: true,
              amount: true,
              currency: true,
              locatorCode: true,
              userId: true,
              offerSnapshot: true,
              travelerSnapshot: true,
              createdAt: true,
            },
          })
        : [],
      filters?.type !== 'flight'
        ? this.prisma.hotelBooking.findMany({
            where: hotelWhere,
            orderBy: { createdAt: 'desc' },
            take,
            select: {
              id: true,
              status: true,
              amount: true,
              currency: true,
              supplierReference: true,
              hotelbedsRef: true,
              supplierStatus: true,
              hotelbedsStatus: true,
              userId: true,
              hotelSnapshot: true,
              holder: true,
              createdAt: true,
            },
          })
        : [],
    ]);

    const [flightCount, hotelCount] = await Promise.all([
      filters?.type !== 'hotel'
        ? this.prisma.flightBooking.count({ where: flightWhere })
        : 0,
      filters?.type !== 'flight'
        ? this.prisma.hotelBooking.count({ where: hotelWhere })
        : 0,
    ]);

    // Collect unique user IDs to batch-fetch agent info
    const userIds = new Set<string>();
    for (const f of flights) if (f.userId) userIds.add(f.userId);
    for (const h of hotels) if (h.userId) userIds.add(h.userId);

    const usersMap = new Map<
      string,
      {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      }
    >();
    if (userIds.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      for (const u of users) usersMap.set(u.id, u);
    }

    const allItems: AgentBookingFeedItem[] = [
      ...flights.map((b) => ({
        id: b.id,
        type: 'flight' as const,
        status: b.status,
        amount: b.amount,
        currency: b.currency,
        ref: b.locatorCode,
        agent: b.userId ? (usersMap.get(b.userId) ?? null) : null,
        from: b.offerSnapshot?.from,
        to: b.offerSnapshot?.to,
        passengerName: b.travelerSnapshot?.[0]?.firstName
          ? `${b.travelerSnapshot[0].firstName} ${b.travelerSnapshot[0].lastName || ''}`
          : undefined,
        createdAt: b.createdAt.toISOString(),
      })),
      ...hotels.map((b) => ({
        id: b.id,
        type: 'hotel' as const,
        status: b.status,
        amount: b.amount,
        currency: b.currency,
        ref: b.supplierReference ?? b.hotelbedsRef,
        supplierStatus: b.supplierStatus ?? b.hotelbedsStatus ?? null,
        agent: b.userId ? (usersMap.get(b.userId) ?? null) : null,
        from: b.hotelSnapshot?.name,
        passengerName: b.holder?.name,
        createdAt: b.createdAt.toISOString(),
      })),
    ];

    const sorted = allItems.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const total = flightCount + hotelCount;

    return {
      items: sorted.slice(skip, skip + limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin cancels any booking (regardless of ownership).
   * Uses RefundService.processCancellation with CancellationFeeRule-based fee calculation.
   */
  async adminCancelBooking(
    bookingId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<any> {
    const booking = await this.findAnyBooking(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    // Cancel at the supplier BEFORE local state changes (flights — Duffel /
    // Travelport NDC+GDS). Mirrors the hotel behaviour in RefundService:
    // supplier failures are logged but never block the local cancellation.
    // ponytail: supplier cancel is per-provider via the booking registry;
    // no cross-provider retry.
    if (booking.type === 'flight') {
      try {
        const flight = await this.prisma.flightBooking.findUnique({
          where: { id: bookingId },
          select: {
            provider: true,
            locatorCode: true,
            workbenchId: true,
            workflowSummary: true,
            offerSnapshot: true,
          },
        });
        const summary = (flight?.workflowSummary ?? {}) as Record<
          string,
          unknown
        >;
        const supplierBookingId =
          (summary.supplierBookingId as string | undefined) ??
          (summary.orderId as string | undefined) ??
          flight?.workbenchId ??
          undefined;
        const provider = this.flightBookingRegistry.getProvider(
          toFlightsProviderKey(flight?.provider),
        );
        const channel = this.resolveTravelportChannel(flight);
        // A fake (demo/guest fallback) PNR has no supplier reservation — never
        // call the supplier with it; the local cancel below still refunds.
        if (provider.cancelBooking && !isFakeBooking(flight ?? {})) {
          const cancel = await provider.cancelBooking({
            bookingId,
            supplierBookingId,
            locatorCode: flight?.locatorCode ?? undefined,
            contentSource: channel.contentSource,
            offerIdentifier: channel.offerIdentifier,
          });
          if (!cancel.ok) {
            this.logger.warn(
              `[ADMIN_CANCEL] Supplier (${flight?.provider}) not cancelled for flight ${bookingId}: ${cancel.message ?? 'unknown reason'}`,
            );
          } else {
            this.logger.log(
              `[ADMIN_CANCEL] Supplier (${flight?.provider}) cancelled flight ${bookingId}`,
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[ADMIN_CANCEL] Supplier cancellation attempt failed for flight ${bookingId}: ${msg}`,
        );
      }
    }

    return this.refundService.processCancellation(
      bookingId,
      booking.userId ?? '',
      reason,
      adminUserId,
    );
  }

  /**
   * Admin issues a held/pending flight booking (manual issue flow for
   * bank-transfer / pay-later / toggle-OFF bookings).
   *
   * Gating differs from the competitor reference on purpose: our hold flow
   * stores the supplier PNR *before* ticketing, so a locator being present
   * is required — not a refusal reason. Refuse only when already
   * ticketed/booked (already issued) or terminal (cancelled/voided/failed).
   */
  async adminIssueBooking(bookingId: string, adminUserId: string): Promise<any> {
    const booking = await this.findAnyBooking(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    // Hotels issue = supplier confirm (no ticket step exists in hotel land).
    if (booking.type === 'hotel') {
      return this.adminIssueHotelBooking(bookingId, booking.status, adminUserId);
    }

    const status = (booking.status ?? '').toLowerCase();
    if (['ticketed', 'booked'].includes(status))
      throw new BusinessError(
        'BOOKING_ALREADY_ISSUED',
        `Booking ${bookingId} is already issued (status=${booking.status}).`,
      );
    if (
      ['cancelled', 'voided', 'void_requested', 'failed', 'hold_expired', 'refunded'].includes(
        status,
      )
    )
      throw new BusinessError(
        'BOOKING_ISSUE_INVALID_STATE',
        `Booking ${bookingId} cannot be issued from status=${booking.status}.`,
      );

    // ticketBooking() runs confirm (hold) when no locator exists, then tickets.
    // forceTicket: an explicit admin Issue always tickets, even when the
    // instance runs hold_only (which only governs the automatic flow).
    const result = await this.flightBookingService.ticketBooking(bookingId, {
      forceTicket: true,
    });
    if (!result.ok)
      throw new BusinessError(
        'BOOKING_ISSUE_FAILED',
        result.message ?? 'Supplier ticketing failed.',
      );

    // Manual-capture: an AUTHORIZED (not yet charged) card payment must be
    // captured now that the supplier ticket exists — otherwise money stays
    // authorized forever. Mirrors flight-payment.listener's post-ticket capture.
    // Manual methods (bank_transfer / pay_later): the admin just verified the
    // money off-channel, so flip the PENDING row to PAID — otherwise the
    // booking reads confirmed while payment stays pending forever.
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      // Prefer the live payment (pending manual / authorized card), not an
      // earlier cancelled or failed attempt that happens to sort first.
      const payment =
        payments?.find(
          (p) =>
            p.status === PaymentStatus.PENDING ||
            p.status === PaymentStatus.AUTHORIZED,
        ) ?? payments?.[0];
      if (
        payment &&
        payment.captureMethod === 'manual' &&
        payment.status === PaymentStatus.AUTHORIZED
      ) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway?.capturePayment && payment.providerPaymentId) {
          await gateway.capturePayment(payment.providerPaymentId);
        }
        payment.status = PaymentStatus.PAID;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
      } else if (
        payment &&
        payment.status === PaymentStatus.PENDING &&
        (String(payment.gateway).toUpperCase() === 'BANK_TRANSFER' ||
          String(payment.gateway).toUpperCase() === 'PAY_LATER')
      ) {
        payment.status = PaymentStatus.PAID;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
        this.logger.log(
          `[ADMIN_ISSUE] Manual ${payment.gateway} payment ${payment.id} marked PAID on issue of ${bookingId}`,
        );
      }
    } catch (capErr: unknown) {
      this.logger.warn(
        `[ADMIN_ISSUE] Manual capture failed for ${bookingId}: ${capErr instanceof Error ? capErr.message : String(capErr)}`,
      );
    }

    // Audit: central log + booking-local trail (edit-tab reads workflowSummary).
    const refreshed = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      select: { workflowSummary: true, locatorCode: true, status: true },
    });
    const summary =
      (refreshed?.workflowSummary as Record<string, unknown> | null) ?? {};
    await this.prisma.flightBooking.update({
      where: { id: bookingId },
      data: {
        workflowSummary: {
          ...summary,
          adminIssuedBy: adminUserId,
          adminIssuedAt: new Date().toISOString(),
        } as any,
      },
    });
    await this.auditLog
      .log({
        userId: adminUserId,
        action: 'BOOKING_ISSUE',
        entity: 'FlightBooking',
        entityId: bookingId,
        description: `Admin issued booking ${bookingId} (PNR ${refreshed?.locatorCode ?? result.locatorCode ?? 'n/a'})`,
        newValue: { status: refreshed?.status ?? result.status },
      })
      .catch(() => {});

    // Same eventId for outbox + direct (shared dedup identity) — outbox
    // drives the customer email, direct drives the realtime UI ping.
    const eventId = randomUUID();
    const issuedPayload = {
      bookingId,
      bookingType: 'FLIGHT',
      locatorCode: refreshed?.locatorCode ?? result.locatorCode,
      issuedBy: adminUserId,
    };
    await this.outboxWriter
      .write({
        idempotencyKey: eventId,
        eventType: 'booking.issued',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: issuedPayload,
      })
      .catch(() => {});
    await this.notifications
      .notifyDirect({
        idempotencyKey: eventId,
        eventType: 'booking.issued',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: issuedPayload,
      })
      .catch(() => {});

    return {
      ok: true,
      bookingId,
      status: refreshed?.status ?? result.status,
      locatorCode: refreshed?.locatorCode ?? result.locatorCode,
    };
  }

  /**
   * Admin issues a pending hotel booking = supplier confirm (re-validate
   * rate, create supplier booking). No ticket/void steps exist in hotel
   * land — Cancel covers reversal.
   */
  private async adminIssueHotelBooking(
    bookingId: string,
    status: string,
    adminUserId: string,
  ): Promise<any> {
    const s = (status ?? '').toLowerCase();
    if (s === 'booked')
      throw new BusinessError(
        'BOOKING_ALREADY_ISSUED',
        `Booking ${bookingId} is already issued (status=${status}).`,
      );
    if (['cancelled', 'failed', 'refunded'].includes(s))
      throw new BusinessError(
        'BOOKING_ISSUE_INVALID_STATE',
        `Booking ${bookingId} cannot be issued from status=${status}.`,
      );

    const result = await this.hotelBookingService.confirm(bookingId);

    // Same as flights: a verified manual payment flips PENDING → PAID on
    // issue so payment status tracks the confirmed booking.
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      // Prefer the live payment (pending manual / authorized card), not an
      // earlier cancelled or failed attempt that happens to sort first.
      const payment =
        payments?.find(
          (p) =>
            p.status === PaymentStatus.PENDING ||
            p.status === PaymentStatus.AUTHORIZED,
        ) ?? payments?.[0];
      if (
        payment &&
        payment.status === PaymentStatus.PENDING &&
        (String(payment.gateway).toUpperCase() === 'BANK_TRANSFER' ||
          String(payment.gateway).toUpperCase() === 'PAY_LATER')
      ) {
        payment.status = PaymentStatus.PAID;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
        this.logger.log(
          `[ADMIN_ISSUE] Manual ${payment.gateway} payment ${payment.id} marked PAID on issue of hotel ${bookingId}`,
        );
      }
    } catch (payErr: unknown) {
      this.logger.warn(
        `[ADMIN_ISSUE] Manual payment flip failed for hotel ${bookingId}: ${payErr instanceof Error ? payErr.message : String(payErr)}`,
      );
    }

    await this.auditLog
      .log({
        userId: adminUserId,
        action: 'BOOKING_ISSUE',
        entity: 'HotelBooking',
        entityId: bookingId,
        description: `Admin issued hotel booking ${bookingId} (ref ${result.reference ?? 'n/a'})`,
        newValue: { status: result.status },
      })
      .catch(() => {});

    const eventId = randomUUID();
    const issuedPayload = {
      bookingId,
      bookingType: 'HOTEL',
      reference: result.reference ?? null,
      issuedBy: adminUserId,
    };
    await this.outboxWriter
      .write({
        idempotencyKey: eventId,
        eventType: 'booking.issued',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: issuedPayload,
      })
      .catch(() => {});
    await this.notifications
      .notifyDirect({
        idempotencyKey: eventId,
        eventType: 'booking.issued',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: issuedPayload,
      })
      .catch(() => {});

    return { ok: true, bookingId, status: result.status, reference: result.reference ?? null };
  }

  /**
   * Cancellation fee estimate WITHOUT cancelling.
   * For hotel bookings uses the supplier's persisted cancellation policies.
   */
  async getCancelEstimate(bookingId: string): Promise<any> {
    const booking = await this.findAnyBooking(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    let estimate;
    try {
      estimate = await this.refundService.getRefundEstimate(bookingId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[ADMIN_CANCEL] Refund estimate failed for ${bookingId}: ${msg}`);
      const fallback = {
        bookingId,
        bookingType: booking.type,
        status: booking.status,
        totalAmount: booking.amount ?? 0,
        currency: booking.currency ?? 'USD',
        cancellationFee: null,
        refundAmount: null,
        refundType: 'wallet',
        isFreeCancellation: false,
        policyDescription: null,
        upcomingFee: null,
        upcomingFeeFrom: null,
        upcomingFeeDescription: null,
        policiesKnown: false,
        policySource: 'none',
        message: `Could not compute the cancellation estimate (${msg}). The supplier may still apply charges under its own policy.`,
      };
      // Still try a live Travelport quote before giving up.
      if (booking.type === 'flight') {
        try {
          const flight = await this.prisma.flightBooking.findUnique({
            where: { id: bookingId },
            select: { provider: true, locatorCode: true, workbenchId: true, workflowSummary: true, offerSnapshot: true },
          });
          const summary = (flight?.workflowSummary ?? {}) as Record<string, unknown>;
          const supplierBookingId =
            (summary.supplierBookingId as string | undefined) ??
            (summary.orderId as string | undefined) ??
            flight?.workbenchId ??
            undefined;
          const provider = this.flightBookingRegistry.getProvider(
            toFlightsProviderKey(flight?.provider),
          );
          const channel = this.resolveTravelportChannel(flight);
          if (provider.quoteRefund && !isFakeBooking(flight ?? {})) {
            const quote = await provider.quoteRefund({
              bookingId,
              locatorCode: flight?.locatorCode ?? undefined,
              supplierBookingId,
              contentSource: channel.contentSource,
              offerIdentifier: channel.offerIdentifier,
            });
            if (quote.ok && quote.refundable && quote.refundAmount != null) {
              const total = fallback.totalAmount || 0;
              const refundAmount = Math.min(Number(quote.refundAmount), total);
              // Persist the live figure: the next estimate (or the workspace)
              // reuses it as a cached live quote instead of re-hitting the
              // supplier on every open. Best-effort — never blocks the answer.
              this.prisma.flightBooking
                .update({
                  where: { id: bookingId },
                  data: {
                    workflowSummary: {
                      ...(summary as Record<string, unknown>),
                      liveRefundQuote: {
                        refundable: true,
                        refundAmount,
                        currency: fallback.currency,
                        at: new Date().toISOString(),
                      },
                    } as any,
                  },
                })
                .catch((e: unknown) =>
                  this.logger.warn(
                    `[ADMIN_CANCEL] Live-quote persist failed for ${bookingId}: ${e instanceof Error ? e.message : String(e)}`,
                  ),
                );
              return {
                ...fallback,
                cancellationFee: Math.round((total - refundAmount) * 100) / 100,
                refundAmount,
                isFreeCancellation: refundAmount >= total,
                policyDescription: quote.message ?? null,
                policiesKnown: true,
                policySource: 'live',
                message: null,
              };
            }
          }
        } catch (quoteErr: unknown) {
          const qmsg = quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
          this.logger.warn(`[ADMIN_CANCEL] Live quote fallback failed for ${bookingId}: ${qmsg}`);
        }
      }
      return fallback;
    }

    // When the local snapshot has no fare conditions, ask the supplier for a
    // live refund quote (Duffel order cancellation / Travelport refundquote).
    // Only applied when the base estimate is explicitly unknown.
    if (booking.type === 'flight' && estimate.policiesKnown === false) {
      try {
        const flight = await this.prisma.flightBooking.findUnique({
          where: { id: bookingId },
          select: {
            provider: true,
            locatorCode: true,
            workbenchId: true,
            workflowSummary: true,
            offerSnapshot: true,
          },
        });
        const summary = (flight?.workflowSummary ?? {}) as Record<
          string,
          unknown
        >;
        const supplierBookingId =
          (summary.supplierBookingId as string | undefined) ??
          (summary.orderId as string | undefined) ??
          flight?.workbenchId ??
          undefined;
        const provider = this.flightBookingRegistry.getProvider(
          toFlightsProviderKey(flight?.provider),
        );
        const channel = this.resolveTravelportChannel(flight);
        if (provider.quoteRefund && !isFakeBooking(flight ?? {})) {
          const quote = await provider.quoteRefund({
            bookingId,
            locatorCode: flight?.locatorCode ?? undefined,
            supplierBookingId,
            contentSource: channel.contentSource,
            offerIdentifier: channel.offerIdentifier,
          });
          // Only trust this as a confident, known answer when the supplier
          // gave us an unambiguous one: either refundable:false (the fee is
          // simply the full total, no amount needed) or refundable:true WITH
          // a concrete refundAmount. quoteRefund() can also return
          // refundable:true with no refundAmount (supplier confirmed the
          // booking is cancellable but didn't expose a parseable figure) —
          // defaulting that missing amount to the full total via `?? total`
          // silently turned "amount unknown" into "100% refund = free",
          // which is exactly the false "free cancellation" conflict against
          // offer/snapshot pages. Fall through to the unresolved state below
          // instead of fabricating a number.
          const hasConfidentAnswer =
            quote.ok &&
            (quote.refundable === false ||
              (quote.refundable === true && quote.refundAmount != null));
          if (hasConfidentAnswer) {
            const refundAmount = quote.refundable
              ? Math.min(Number(quote.refundAmount), estimate.totalAmount)
              : 0;
            // Persist (see above): cached live quote for the next estimate.
            this.prisma.flightBooking
              .update({
                where: { id: bookingId },
                data: {
                  workflowSummary: {
                    ...(summary as Record<string, unknown>),
                    liveRefundQuote: {
                      refundable: quote.refundable,
                      refundAmount: quote.refundable ? refundAmount : 0,
                      currency: estimate.currency,
                      at: new Date().toISOString(),
                    },
                  } as any,
                },
              })
              .catch((e: unknown) =>
                this.logger.warn(
                  `[ADMIN_CANCEL] Live-quote persist failed for ${bookingId}: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
            return {
              bookingId,
              bookingType: booking.type,
              status: booking.status,
              totalAmount: estimate.totalAmount,
              currency: estimate.currency,
              cancellationFee:
                Math.max(0, Math.round((estimate.totalAmount - refundAmount) * 100) / 100),
              refundAmount,
              refundType: 'wallet',
              isFreeCancellation:
                quote.refundable && refundAmount === estimate.totalAmount,
              policyDescription: quote.refundable
                ? quote.message ?? null
                : 'Non-refundable fare — the full amount is retained (supplier).',
              policiesKnown: true,
              policySource: 'live',
              message: null,
            };
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[ADMIN_CANCEL] Live refund quote unavailable for ${bookingId}: ${msg}`,
        );
      }
    }

    return {
      bookingId,
      bookingType: booking.type,
      status: booking.status,
      totalAmount: estimate.totalAmount,
      currency: estimate.currency,
      cancellationFee: estimate.cancellationFee,
      refundAmount: estimate.netRefund,
      refundType: estimate.refundType,
      isFreeCancellation: estimate.isFreeCancellation,
      policyDescription: estimate.feeDescription,
      upcomingFee: (estimate as any).upcomingFee,
      upcomingFeeFrom: (estimate as any).upcomingFeeFrom,
      upcomingFeeDescription: (estimate as any).upcomingFeeDescription,
      policiesKnown: (estimate as any).policiesKnown ?? true,
      policySource: (estimate as any).policySource ?? null,
      message: (estimate as any).message ?? null,
    };
  }

  /**
   * Get comprehensive financial summary for a booking.
   * Includes wallet transactions, commission records, modification history, and credit shells.
   */
  async getBookingFinancialSummary(
    bookingId: string,
  ): Promise<BookingFinancialSummary | null> {
    // Find the booking to determine its type and user
    const booking = await this.findAnyBooking(bookingId);
    if (!booking) return null;

    const [
      walletTransactions,
      commissionRecords,
      modificationRequests,
      creditShells,
    ] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { bookingId, bookingType: booking.type },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commissionRecord.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bookingModificationRequest.findMany({
        where: { bookingId, bookingType: booking.type },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.creditShell.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calculate total refunded from wallet transactions
    const refundedAmount = walletTransactions
      .filter(
        (tx) =>
          tx.type === 'refund' ||
          (tx.type === 'deposit' && tx.description?.includes('Cancellation')),
      )
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

    // Find cancellation fee from modification request
    const cancelRequest = modificationRequests.find(
      (m) => m.type === 'cancel' && m.status === 'processed',
    );
    const cancellationFee = cancelRequest?.cancellationFee
      ? Number(cancelRequest.cancellationFee)
      : 0;

    return {
      bookingId,
      bookingType: booking.type,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      refundedAmount,
      cancellationFee,
      walletTransactions: walletTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        balanceBefore: Number(tx.balanceBefore),
        balanceAfter: Number(tx.balanceAfter),
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
      })),
      commissionRecords: commissionRecords.map((cr) => ({
        id: cr.id,
        commissionAmount: Number(cr.commissionAmount),
        rate: Number(cr.rate),
        rateType: cr.rateType,
        currency: cr.currency ?? 'USD',
        status: cr.status,
        createdAt: cr.createdAt.toISOString(),
      })),
      modificationHistory: modificationRequests.map((mr) => ({
        id: mr.id,
        type: mr.type,
        status: mr.status,
        reason: mr.reason,
        refundAmount: mr.refundAmount ? Number(mr.refundAmount) : null,
        cancellationFee: mr.cancellationFee ? Number(mr.cancellationFee) : null,
        creditShellId: mr.creditShellId,
        createdAt: mr.createdAt.toISOString(),
      })),
      creditShells: creditShells.map((cs) => ({
        id: cs.id,
        originalAmount: Number(cs.originalAmount),
        remainingAmount: Number(cs.remainingAmount),
        currency: cs.currency ?? 'USD',
        status: cs.status,
        expiresAt: cs.expiresAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Resolve which Travelport channel (NDC vs GDS) a flight booking used, plus
   * the NDC offer identifier if applicable — needed to route cancelBooking/
   * quoteRefund to the correct supplier endpoint (NDC: canceloffer, GDS:
   * cancelitems). Mirrors the resolution order already used by the
   * customer-facing cancel flow in flight-booking-public.service.ts: snapshot
   * top level (stored at creation) -> selectedOfferContext -> workflowSummary
   * (stored at ticketing). The admin cancel path previously never resolved
   * these at all, silently defaulting every flight to the GDS branch.
   */
  private resolveTravelportChannel(flight?: {
    offerSnapshot?: unknown;
    workflowSummary?: unknown;
  } | null): { contentSource?: string; offerIdentifier?: string } {
    const snapshot = (flight?.offerSnapshot ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const summary = (flight?.workflowSummary ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const snapshotCtx = snapshot?.selectedOfferContext as
      | Record<string, unknown>
      | undefined;
    return {
      contentSource:
        (snapshot?.contentSource as string | undefined) ??
        (snapshotCtx?.contentSource as string | undefined) ??
        (summary?.contentSource as string | undefined),
      offerIdentifier:
        (snapshot?.offerIdentifier as string | undefined) ??
        (Array.isArray(snapshotCtx?.offeringIds)
          ? (snapshotCtx.offeringIds as string[])[0]
          : undefined),
    };
  }

  /**
   * Find any booking (flight or hotel) without ownership constraint.
   * Returns minimal booking info needed for admin operations.
   */
  private async findAnyBooking(bookingId: string): Promise<{
    id: string;
    type: 'flight' | 'hotel';
    status: string;
    userId: string | null;
    amount: number | null;
    currency: string | null;
    createdAt: Date;
  } | null> {
    // Independent PK lookups — parallel, not sequential.
    const [flight, hotel] = await Promise.all([
      this.prisma.flightBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          userId: true,
          amount: true,
          currency: true,
          createdAt: true,
        },
      }),
      this.prisma.hotelBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          userId: true,
          amount: true,
          currency: true,
          createdAt: true,
        },
      }),
    ]);
    // Guest bookings have userId === null — they must still be estimable/cancellable by admins.
    if (flight) {
      return {
        id: flight.id,
        type: 'flight',
        status: flight.status,
        userId: flight.userId,
        amount: flight.amount,
        currency: flight.currency,
        createdAt: flight.createdAt,
      };
    }

    if (hotel) {
      return {
        id: hotel.id,
        type: 'hotel',
        status: hotel.status,
        userId: hotel.userId,
        amount: hotel.amount,
        currency: hotel.currency,
        createdAt: hotel.createdAt,
      };
    }

    return null;
  }
}
