import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { MarkupService } from '../markup/markup.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { ImmediateOutboxDispatcherService } from '../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { WalletService } from '../wallet/wallet.service';
import { PermissionCheckService } from '../access-control/application/services/permission-check.service';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { computeHotelCancellationFee } from '../hotels/application/services/hotel-cancellation-fee.util';
import { CurrencyService } from '../currency/application/services/currency.service';

export interface MarkedUpOffer {
  originalPrice: number;
  markedUpPrice: number;
  markupPercent: number;
  appliedRules: Array<{ name: string; markupAmount: number }>;
  offer: any;
}

export interface AgentBookingListItem {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  from?: string;
  to?: string;
  passengerName?: string;
  customerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentBookingDetail {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  locatorCode?: string | null;
  provider: string;
  offerSnapshot?: any;
  travelerSnapshot?: any;
  holder?: any;
  paxes?: any;
  hotel?: any;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentBookingFilters {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
}

export interface PaginatedAgentBookings {
  items: AgentBookingListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchInput {
  type: 'flight' | 'hotel';
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  searchParams?: any;
  supplierId?: string;
  routeFrom?: string;
  routeTo?: string;
}

export interface CreateBookingInput {
  type: 'flight' | 'hotel';
  /** Originating supplier for hotel rates (amadeus/hotelbeds/ratehawk) — persisted on the booking for the payment listener. */
  provider?: string;
  offerId?: string;
  productId?: string;
  productIds?: string[];
  rateKey?: string;
  holder?: any;
  paxes?: any[];
  travelers?: any[];
  totalPrice: number;
  currency: string;
  searchKey?: string;
  catalogUuid?: string;
  from?: string;
  to?: string;
  departureDate?: string;
  tripType?: string;
  supplierId?: string;
  routeFrom?: string;
  routeTo?: string;
  offerSnapshot?: any;
  clientReference?: string;
}

@Injectable()
export class AgentBookingService {
  private readonly logger = new Logger(AgentBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly markupService: MarkupService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
    private readonly auditLog: AuditLogService,
    private readonly walletService: WalletService,
    private readonly permissionCheck: PermissionCheckService,
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
   * Validate agent profile can book — checks approval, KYC, suspension, and booking permission.
   * Throws BusinessError if any check fails.
   */
  async validateAgentCanBook(agentProfileId: string, userId: string, bookingType: 'flight' | 'hotel'): Promise<void> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { isApproved: true, kycStatus: true, isSuspended: true, suspensionReason: true },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (!profile.isApproved) throw new BusinessError('AGENT_NOT_APPROVED', 'Your account has not been approved yet. Please contact support.');
    if (profile.kycStatus !== 'APPROVED') throw new BusinessError('KYC_NOT_COMPLETED', 'KYC verification is required before booking. Current status: ' + profile.kycStatus);
    if (profile.isSuspended) throw new BusinessError('AGENT_SUSPENDED', `Account suspended: ${profile.suspensionReason ?? 'Please contact support'}`);

    const requiredPermission = bookingType === 'flight' ? PermissionCode.AGENT_BOOK_FLIGHTS : PermissionCode.AGENT_BOOK_HOTELS;
    const hasPermission = await this.permissionCheck.userHasPermission(userId, requiredPermission);
    if (!hasPermission) throw new BusinessError('PERMISSION_DENIED', `You do not have permission to book ${bookingType === 'flight' ? 'flights' : 'hotels'}.`);
  }

  /**
   * Apply markup rules to search results.
   * Takes raw search results, applies agent's markup, returns marked-up prices.
   */
  async searchWithMarkups(
    searchInput: SearchInput,
    agentProfileId: string,
    userId: string,
    results: any,
  ): Promise<{ results: any; markups: MarkedUpOffer[] }> {
    const productType = searchInput.type === 'flight' ? 'flights' : 'hotels';
    await this.validateAgentCanBook(agentProfileId, userId, searchInput.type);

    // Bulk pricing: rules + profile fallback resolve ONCE (3 queries max),
    // then every offer/rate computes in memory. The previous per-item
    // calculatePrice() ran 2-3 DB queries per offer (N× supplier search).
    const preloaded = await this.markupService.preloadRules(productType);
    const profileFallback = await this.markupService.getProfileMarkupFallback(
      agentProfileId,
      productType,
      0,
    );

    const markups: MarkedUpOffer[] = [];

    // Process flight offers
    if (searchInput.type === 'flight' && results?.offers) {
      for (const offer of results.offers) {
        // Handle both mock format (totalPrice: number) and provider format (price: { total: number })
        const basePrice =
          typeof offer.totalPrice === 'number' && offer.totalPrice > 0
            ? offer.totalPrice
            : typeof offer.price?.total === 'number' && offer.price.total > 0
              ? offer.price.total
              : 0;
        if (basePrice > 0) {
          const preview = this.markupService.calculatePriceWithRulesForAgent(
            basePrice,
            preloaded,
            agentProfileId,
            profileFallback,
            searchInput.supplierId,
            searchInput.routeFrom ?? searchInput.origin,
            searchInput.routeTo ?? searchInput.destination,
          );
          offer.agentPrice = preview.finalPrice;
          offer.basePrice = basePrice;
          offer.markupPercent = preview.effectiveMarkupPercent;
          markups.push({
            originalPrice: basePrice,
            markedUpPrice: preview.finalPrice,
            markupPercent: preview.effectiveMarkupPercent,
            appliedRules: preview.appliedRules.map((r) => ({
              name: r.rule.name,
              markupAmount: r.markupAmount,
            })),
            offer,
          });
        }
      }
    }

    // Process hotel results
    if (searchInput.type === 'hotel' && results?.hotels) {
      for (const hotel of results.hotels) {
        // Handle both mock format (hotel.rooms[].rates[]) and provider format (hotel.rates[])
        const roomList = Array.isArray(hotel.rooms) ? hotel.rooms : [];
        if (roomList.length > 0) {
          for (const room of roomList) {
            for (const rate of room.rates ?? []) {
              const basePrice =
                typeof rate.net === 'number' && rate.net > 0
                  ? rate.net
                  : (rate.totalRate ?? 0);
              if (basePrice > 0) {
                const preview = this.markupService.calculatePriceWithRulesForAgent(
                  basePrice,
                  preloaded,
                  agentProfileId,
                  profileFallback,
                  searchInput.supplierId,
                  searchInput.routeFrom,
                  searchInput.routeTo,
                );
                rate.agentPrice = preview.finalPrice;
                rate.basePrice = basePrice;
                rate.markupPercent = preview.effectiveMarkupPercent;
                markups.push({
                  originalPrice: basePrice,
                  markedUpPrice: preview.finalPrice,
                  markupPercent: preview.effectiveMarkupPercent,
                  appliedRules: preview.appliedRules.map((r) => ({
                    name: r.rule.name,
                    markupAmount: r.markupAmount,
                  })),
                  offer: rate,
                });
              }
            }
          }
        }
      }
    }

    return { results, markups };
  }

  /**
   * Reserve-Commit Wallet Pattern for booking creation:
   * 0. Server-side price revalidation via MarkupService
   * 1. Reserve: check wallet + credit combined inside a transaction (with FOR UPDATE lock)
   * 2. Call supplier API (outside DB transaction)
   * 3. Commit: confirm deduction, release hold transactionally
   * 4. Write COMMISSION_CALC outbox event
   */
  async createBooking(
    input: CreateBookingInput,
    agentUserId: string,
    agentProfileId: string,
  ): Promise<any> {
    // Step -1: Validate agent can book (approval, KYC, suspension, permission)
    await this.validateAgentCanBook(agentProfileId, agentUserId, input.type);

    // Step 0: Server-side price revalidation
    const snapshot = input.offerSnapshot ?? {};
    const productType = input.type === 'flight' ? 'flights' : 'hotels';
    const basePrice = Number(snapshot.basePrice) || input.totalPrice;

    const serverPreview = await this.markupService.calculatePrice(
      basePrice,
      productType,
      agentProfileId,
      undefined,
      undefined,
      undefined,
      input.currency,
    );
    const serverPrice = serverPreview.finalPrice;

    // Allow 0.5% tolerance for rounding
    const diff = Math.abs(serverPrice - input.totalPrice);
    if (diff > 0.01 && diff / Math.max(serverPrice, 0.01) > 0.005) {
      const [serverText, frontendText] = await Promise.all([
        this.currencyService.formatWithCode(serverPrice, input.currency),
        this.currencyService.formatWithCode(input.totalPrice, input.currency),
      ]);
      throw new BusinessError(
        'PRICE_MISMATCH',
        `Price mismatch. Server calculated ${serverText}, frontend sent ${frontendText}. Please refresh and try again.`,
      );
    }

    const effectivePrice = serverPrice;

    // Fast pre-check: wallet + credit combined (converted into the wallet
    // currency inside isSufficient — effectivePrice is in input.currency).
    const sufficient = await this.walletService.isSufficient(
      agentProfileId,
      effectivePrice,
      input.currency,
    );
    if (!sufficient) {
      throw new BusinessError(
        'INSUFFICIENT_FUNDS',
        `Insufficient wallet balance + credit. Required: ${await this.currencyService.formatWithCode(effectivePrice, input.currency)}`,
      );
    }

    // Step 1: Reserve — create hold with pessimistic lock (check wallet + credit)
    const hold = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          walletBalance: string;
          creditLimit: string;
          creditUsed: string;
          isSuspended: string;
        }>
      >(
        `SELECT id, "walletBalance", "creditLimit", "creditUsed", "isSuspended" FROM "AgentProfile" WHERE id = $1 FOR UPDATE`,
        agentProfileId,
      );
      if (!profile || profile.length === 0) {
        throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
      }

      if (profile[0].isSuspended === 'true') {
        throw new BusinessError(
          'AGENT_SUSPENDED',
          'Account suspended. Cannot create bookings.',
        );
      }

      const walletBalance = Number(profile[0].walletBalance);
      const creditLimit = Number(profile[0].creditLimit);
      const creditUsed = Number(profile[0].creditUsed);
      const creditAvailable = Math.max(0, creditLimit - creditUsed);
      const totalAvailable = walletBalance + creditAvailable;
      // Wallet-side figures are wallet-domain; the required price is in the
      // booking currency — convert the requirement for an apples-to-apples
      // comparison (previously compared raw across currencies).
      const walletCurrency =
        await this.walletService.getProfileCurrency(agentProfileId);
      const requiredInWallet =
        (input.currency ?? 'USD').toUpperCase() === walletCurrency.toUpperCase()
          ? effectivePrice
          : (
              await this.currencyService.convert(
                effectivePrice,
                input.currency ?? 'USD',
                walletCurrency,
              )
            ).amount;

      if (totalAvailable < requiredInWallet) {
        const [availableText, requiredText, walletText, creditText] =
          await Promise.all([
            this.currencyService.formatWithCode(totalAvailable, walletCurrency),
            this.currencyService.formatWithCode(effectivePrice, input.currency),
            this.currencyService.formatWithCode(walletBalance, walletCurrency),
            this.currencyService.formatWithCode(
              creditAvailable,
              walletCurrency,
            ),
          ]);
        throw new BusinessError(
          'INSUFFICIENT_FUNDS',
          `Insufficient wallet + credit. Available: ${availableText}, Required: ${requiredText}. Wallet: ${walletText}, Credit available: ${creditText}`,
        );
      }

      // Create hold record (stamped in the booking currency; the deduction
      // phase converts into the wallet currency at claim time).
      return tx.walletHold.create({
        data: {
          agentProfileId,
          amount: effectivePrice,
          currency: (input.currency ?? 'USD').toUpperCase(),
          status: 'pending',
          bookingType: input.type,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min expiry
        },
      });
    });

    try {
      // Step 2: Create booking (pending_payment — wallet not yet deducted)
      let bookingResult: any;

      if (input.type === 'flight') {
        bookingResult = await this.createFlightBooking(input, agentUserId);
      } else {
        bookingResult = await this.createHotelBooking(input, agentUserId);
      }

      const bookingId = bookingResult.id ?? bookingResult.bookingId;

      // Step 3: Link hold to booking so we can find it during wallet deduction phase
      await this.prisma.walletHold.update({
        where: { id: hold.id },
        data: { bookingId },
      });

      // Step 4: Fire payment.succeeded — triggers Travelport workflow via FlightPaymentListener
      // Wallet deduction happens AFTER supplier workflow succeeds (see booking.supplier_confirmed handler).
      const bookingType = input.type === 'flight' ? 'FLIGHT' : 'HOTEL';
      const paymentSucceededPayload = {
        paymentId: `wallet-${bookingId}`,
        paymentMethod: 'wallet',
        bookingId,
        bookingType,
        amount: effectivePrice,
        currency: input.currency ?? 'USD',
      };
      const eventId = await this.outboxWriter.write({
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        idempotencyKey: `agent-wallet-payment-authorized:${bookingId}`,
        payload: paymentSucceededPayload,
      });
      this.immediateDispatcher.dispatch({
        id: eventId,
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        idempotencyKey: `agent-wallet-payment-authorized:${bookingId}`,
        payload: paymentSucceededPayload,
      });

      await this.auditLog.log({
        userId: agentUserId,
        action: 'BOOKING_CREATED',
        entity: input.type === 'flight' ? 'FlightBooking' : 'HotelBooking',
        entityId: bookingId,
        description: `Agent booked ${input.type} for ${await this.currencyService.formatWithCode(effectivePrice, input.currency)} (awaiting supplier confirmation)`,
        newValue: {
          bookingId,
          type: input.type,
          amount: effectivePrice,
          currency: input.currency,
        },
      });

      return {
        ...bookingResult,
        walletDeducted: 0,
        holdId: hold.id,
        message:
          'Pending supplier confirmation — wallet will be deducted on success.',
      };
    } catch (error: any) {
      // On failure: release hold (no wallet deduction has happened yet)
      await this.prisma.walletHold
        .update({
          where: { id: hold.id },
          data: { status: 'released' },
        })
        .catch((e) =>
          this.logger.error(`Failed to release hold ${hold.id}: ${e}`),
        );

      throw error;
    }
  }

  /**
   * Runs every 5 minutes — releases wallet holds that have expired (>15 min old)
   * to prevent orphaned holds from accumulating.
   */
  async finalizeSupplierConfirmedBooking(bookingId: string): Promise<void> {
    const booking = await this.findBookingById(bookingId);
    if (!booking) {
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found for supplier-confirmed finalization`,
      );
    }

    if (!booking.agentProfileId) {
      this.logger.debug(`Booking ${bookingId} is not agent-owned; skipping agent finalization`);
      return;
    }

    // NOTE: deliberately NOT calling validateAgentCanBook here. The supplier
    // booking is already CONFIRMED at this point — failing validation now
    // would skip the wallet deduction while the agency still owes the
    // supplier for a real booking. Agent eligibility was validated when the
    // booking was created; finalization must always settle the wallet.

    let finalizedAmount: unknown = booking.amount ?? 0;
    let deductedWallet = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const hold = await tx.walletHold.findFirst({
          where: { bookingId, status: 'pending' },
        });

        if (hold) {
          const claimed = await tx.walletHold.updateMany({
            where: { id: hold.id, status: 'pending' },
            data: { status: 'confirmed' },
          });

          if (claimed.count > 0) {
            const result = await this.walletService.deductInTransaction(
              tx,
              booking.agentProfileId!,
              Number(hold.amount),
              booking.id,
              booking.type,
              `Payment for ${booking.type === 'flight' ? 'flight booking' : 'hotel booking'} ${booking.id.slice(0, 8).toUpperCase()} (confirmed)`,
              hold.currency ?? booking.currency ?? undefined,
            );

            finalizedAmount = hold.amount;
            deductedWallet = true;
          }
        }

        await this.writeAgentFinalizationEvents(tx, booking, finalizedAmount);
      });

      this.logger.log(
        deductedWallet
          ? `Wallet deducted ${finalizedAmount} for booking ${bookingId} (supplier confirmed)`
          : `Agent booking ${bookingId} finalized after supplier confirmation`,
      );
    } catch (error: any) {
      this.logger.error(
        `Agent supplier-confirmed finalization failed for booking ${bookingId}: ${error?.message ?? error}`,
      );
      throw error;
    }
  }

  private async writeAgentFinalizationEvents(
    tx: any,
    booking: { id: string; type: 'flight' | 'hotel'; agentProfileId: string },
    bookingAmount: unknown,
  ): Promise<void> {
    await this.outboxWriter.writeInTransactionOnce(tx, {
      eventType: 'COMMISSION_CALC',
      aggregateType: 'Booking',
      aggregateId: booking.id,
      idempotencyKey: `commission-calc:${booking.id}`,
      payload: {
        bookingId: booking.id,
        bookingType: booking.type,
        agentProfileId: booking.agentProfileId,
        bookingAmount,
      },
    });

    await this.outboxWriter.writeInTransactionOnce(tx, {
      eventType: 'DOCUMENT_GEN',
      aggregateType: 'Booking',
      aggregateId: booking.id,
      idempotencyKey: `document-gen:${booking.id}:voucher-invoice`,
      payload: {
        bookingId: booking.id,
        documentTypes: ['voucher', 'invoice'],
      },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async releaseExpiredHolds(): Promise<void> {
    if (process.env.ENABLE_AGENT_HOLD_RELEASE_WORKER === 'false') return;
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const expired = await this.prisma.walletHold.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lte: cutoff },
      },
      data: { status: 'released' },
    });
    if (expired.count > 0) {
      this.logger.log(`Released ${expired.count} expired wallet hold(s)`);
    }
  }

  /** Get agent's unified booking list (both flight + hotel) */
  async getAgentBookings(
    agentUserId: string,
    filters?: AgentBookingFilters,
  ): Promise<PaginatedAgentBookings> {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // Build date filter
    const dateFilter: any = {};
    if (filters?.fromDate || filters?.toDate) {
      if (filters.fromDate) dateFilter.gte = new Date(filters.fromDate);
      if (filters.toDate) dateFilter.lte = new Date(filters.toDate);
    }

    const flightWhere: any = { userId: agentUserId };
    const hotelWhere: any = { userId: agentUserId };
    if (Object.keys(dateFilter).length > 0) {
      flightWhere.createdAt = dateFilter;
      hotelWhere.createdAt = dateFilter;
    }
    if (filters?.status) {
      const s = filters.status.toLowerCase();
      if (s === 'confirmed' || s === 'booked') {
        flightWhere.status = { in: ['confirmed', 'booked', 'ticketed'] };
        hotelWhere.status = { in: ['confirmed', 'booked'] };
      } else {
        flightWhere.status = filters.status;
        hotelWhere.status = filters.status;
      }
    }

    // Windowed merge: (skip + limit) NARROW rows per table, never full blobs.
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
              updatedAt: true,
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
              userId: true,
              hotelSnapshot: true,
              holder: true,
              createdAt: true,
              updatedAt: true,
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

    // Batch owner emails in one query (include + select can't combine).
    const agentIds = new Set<string>();
    for (const f of flights) if (f.userId) agentIds.add(f.userId);
    for (const h of hotels) if (h.userId) agentIds.add(h.userId);
    const agentMail = new Map<string, string>();
    if (agentIds.size > 0) {
      const owners = await this.prisma.user.findMany({
        where: { id: { in: [...agentIds] } },
        select: { id: true, email: true },
      });
      for (const o of owners) agentMail.set(o.id, o.email);
    }

    // Combine and sort all items, then apply pagination to the merged list
    const allItems: AgentBookingListItem[] = [
      ...flights.map((b) => ({
        id: b.id,
        type: 'flight' as const,
        status: b.status,
        amount: b.amount,
        currency: b.currency,
        ref: b.locatorCode,
        from: b.offerSnapshot?.from,
        to: b.offerSnapshot?.to,
        passengerName: b.travelerSnapshot?.[0]?.firstName
          ? `${b.travelerSnapshot[0].firstName} ${b.travelerSnapshot[0].lastName || ''}`
          : undefined,
        customerEmail:
          b.travelerSnapshot?.[0]?.email ||
          b.travelerSnapshot?.[0]?.contactEmail ||
          (b.userId ? agentMail.get(b.userId) : undefined) ||
          undefined,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      ...hotels.map((b) => ({
        id: b.id,
        type: 'hotel' as const,
        status: b.status,
        amount: b.amount,
        currency: b.currency,
        ref: b.supplierReference ?? b.hotelbedsRef,
        from: b.hotelSnapshot?.name,
        passengerName: b.holder?.name,
        customerEmail: b.holder?.email || (b.userId ? agentMail.get(b.userId) : undefined) || undefined,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
    ];

    // Sort combined list, then apply pagination
    const sorted = allItems.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const total = flightCount + hotelCount;
    const paged = sorted.slice(skip, skip + limit);

    return {
      items: paged,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Get a single booking detail */
  async getAgentBookingDetail(
    bookingId: string,
    agentUserId: string,
  ): Promise<AgentBookingDetail | null> {
    // Independent PK lookups — parallel, not sequential.
    const [flight, hotel] = await Promise.all([
      this.prisma.flightBooking.findUnique({ where: { id: bookingId } }),
      this.prisma.hotelBooking.findUnique({ where: { id: bookingId } }),
    ]);
    if (flight && flight.userId === agentUserId) {
      return {
        id: flight.id,
        type: 'flight',
        status: flight.status,
        amount: flight.amount,
        currency: flight.currency,
        ref: flight.locatorCode,
        locatorCode: flight.locatorCode,
        provider: flight.provider,
        offerSnapshot: flight.offerSnapshot,
        travelerSnapshot: flight.travelerSnapshot,
        message: flight.message,
        createdAt: flight.createdAt.toISOString(),
        updatedAt: flight.updatedAt.toISOString(),
      };
    }

    if (hotel && hotel.userId === agentUserId) {
      return {
        id: hotel.id,
        type: 'hotel',
        status: hotel.status,
        amount: hotel.amount,
        currency: hotel.currency,
        ref: hotel.supplierReference ?? hotel.hotelbedsRef,
        provider: hotel.provider,
        holder: hotel.holder,
        paxes: hotel.paxes,
        hotel: hotel.hotelSnapshot,
        message: hotel.message,
        createdAt: hotel.createdAt.toISOString(),
        updatedAt: hotel.updatedAt.toISOString(),
      };
    }

    return null;
  }

  // ── Cancel & Modify ────────────────────────────────────

  /**
   * Cancel an agent's booking with refund calculation.
   * Handles both flight and hotel bookings.
   * Refunds to wallet, creates CreditShell if applicable, writes BOOKING_CANCELLED outbox event.
   */
  async cancelBooking(
    bookingId: string,
    agentUserId: string,
    reason?: string,
    requestedBy: 'agent' | 'admin' = 'agent',
    adminUserId?: string,
  ): Promise<{
    booking: any;
    refundAmount: number;
    cancellationFee: number;
    creditShellId?: string;
    modificationRequestId: string;
  }> {
    const actorId = requestedBy === 'admin' ? adminUserId : agentUserId;

    // Find the booking
    const booking = await this.findBookingById(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    // Ownership check for agent-originated requests
    if (requestedBy === 'agent' && booking.userId !== agentUserId) {
      throw new BusinessError(
        'FORBIDDEN',
        'You can only cancel your own bookings',
      );
    }

    // Control surface: cancelling requires agent:cancel_bookings.
    if (requestedBy === 'agent') {
      const canCancel = await this.permissionCheck.userHasPermission(agentUserId, PermissionCode.AGENT_CANCEL_BOOKINGS);
      if (!canCancel) throw new BusinessError('PERMISSION_DENIED', 'Cancelling bookings is not enabled for your account.');
    }

    // Verify booking is cancellable
    const cancellableStatuses = ['pending', 'confirmed', 'ticketed'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BusinessError(
        'BOOKING_NOT_CANCELLABLE',
        `Booking status "${booking.status}" cannot be cancelled`,
      );
    }

    // Calculate cancellation fees and refund based on rules
    const { refundAmount, cancellationFee } =
      this.calculateCancellationRefund(booking);

    // Create modification request record
    const modRequest = await this.prisma.bookingModificationRequest.create({
      data: {
        bookingId,
        bookingType: booking.type,
        agentUserId,
        requestedBy,
        type: 'cancel',
        reason: reason ?? null,
        status: 'pending',
        refundAmount,
        cancellationFee,
      },
    });

    let creditShellId: string | undefined;

    // Process refund if applicable (refundAmount > 0)
    if (refundAmount > 0) {
      // Determine if refund goes to wallet or credit shell
      // Credit shells are used for partial cancellations or airline credit policies
      const useCreditShell = this.shouldUseCreditShell(booking);

      if (useCreditShell) {
        // Create a credit shell (non-cash refund usable only for future bookings)
        const shellCurrency = (booking.currency ?? 'USD').toUpperCase();
        const shell = await this.prisma.creditShell.create({
          data: {
            agentProfileId: booking.agentProfileId,
            bookingId,
            bookingType: booking.type,
            originalAmount: refundAmount,
            remainingAmount: refundAmount,
            currency: shellCurrency,
            status: 'active',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          },
        });
        creditShellId = shell.id;

        // Record the credit shell as wallet transaction
        await this.prisma.walletTransaction.create({
          data: {
            agentProfileId: booking.agentProfileId,
            type: 'refund',
            amount: refundAmount,
            currency: shellCurrency,
            balanceBefore: 0,
            balanceAfter: 0,
            reference: `credit-shell-${shell.id}`,
            description: `Credit shell created (${reason ?? 'Cancellation refund'}) — usable for future bookings`,
            status: 'completed',
            bookingId,
            bookingType: booking.type,
          },
        });
      } else {
        // Cash refund — refund to wallet (converted into the wallet currency
        // inside deposit; the record keeps the booking currency as original).
        await this.walletService.deposit(
          booking.agentProfileId,
          refundAmount,
          undefined,
          `Cancellation refund — ${reason ?? 'Booking cancelled'}`,
          actorId,
          undefined,
          booking.currency ?? undefined,
        );
      }
    }

    // Update booking status
    const updatedBooking = await this.updateBookingStatus(
      bookingId,
      booking.type,
      'cancelled',
      reason,
    );

    // Update modification request to processed
    await this.prisma.bookingModificationRequest.update({
      where: { id: modRequest.id },
      data: {
        status: 'processed',
        creditShellId: creditShellId ?? null,
        processedAt: new Date(),
        processedById: requestedBy === 'admin' ? adminUserId : undefined,
      },
    });

    // Write BOOKING_CANCELLED outbox event for commission reversal
    await this.outboxWriter.write({
      eventType: 'BOOKING_CANCELLED',
      aggregateType: 'Booking',
      aggregateId: bookingId,
      payload: {
        bookingId,
        bookingType: booking.type,
        agentProfileId: booking.agentProfileId,
      },
    });

    await this.auditLog.log({
      userId: actorId,
      action: 'BOOKING_CANCELLED',
      entity: booking.type === 'flight' ? 'FlightBooking' : 'HotelBooking',
      entityId: bookingId,
      description: `Booking cancelled. Refund: ${await this.currencyService.formatWithCode(refundAmount, booking.currency ?? 'USD')}, Fee: ${await this.currencyService.formatWithCode(cancellationFee, booking.currency ?? 'USD')}${creditShellId ? ', Credit shell created' : ''}`,
      newValue: { refundAmount, cancellationFee, creditShellId, reason },
    });

    return {
      booking: updatedBooking,
      refundAmount,
      cancellationFee,
      creditShellId,
      modificationRequestId: modRequest.id,
    };
  }

  /**
   * Request a modification to an existing booking.
   * Creates a modification request record (actual modification depends on supplier).
   */
  async modifyBooking(
    bookingId: string,
    agentUserId: string,
    modificationDetails: {
      type: string; // e.g. 'date_change', 'passenger_change', 'upgrade'
      newValue?: any;
      reason?: string;
    },
    requestedBy: 'agent' | 'admin' = 'agent',
    adminUserId?: string,
  ): Promise<{ modificationRequestId: string; booking: any; message: string }> {
    const booking = await this.findBookingById(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    if (requestedBy === 'agent' && booking.userId !== agentUserId) {
      throw new BusinessError(
        'FORBIDDEN',
        'You can only modify your own bookings',
      );
    }

    // Control surface: modifying requires agent:modify_bookings.
    if (requestedBy === 'agent') {
      const canModify = await this.permissionCheck.userHasPermission(agentUserId, PermissionCode.AGENT_MODIFY_BOOKINGS);
      if (!canModify) throw new BusinessError('PERMISSION_DENIED', 'Modifying bookings is not enabled for your account.');
    }

    if (booking.status === 'cancelled') {
      throw new BusinessError(
        'BOOKING_CANCELLED',
        'Cannot modify a cancelled booking',
      );
    }

    const modRequest = await this.prisma.bookingModificationRequest.create({
      data: {
        bookingId,
        bookingType: booking.type,
        agentUserId,
        requestedBy,
        type: 'modify',
        reason: modificationDetails.reason ?? modificationDetails.type,
        status: 'pending',
        notes: JSON.stringify(modificationDetails),
      },
    });

    await this.auditLog.log({
      userId: requestedBy === 'admin' ? adminUserId : agentUserId,
      action: 'BOOKING_MODIFICATION_REQUESTED',
      entity: booking.type === 'flight' ? 'FlightBooking' : 'HotelBooking',
      entityId: bookingId,
      description: `Modification requested: ${modificationDetails.type}`,
      newValue: modificationDetails,
    });

    return {
      modificationRequestId: modRequest.id,
      booking: this.toBookingResult(booking),
      message: `Modification request submitted. Reference: ${modRequest.id}. Our team will review and follow up.`,
    };
  }

  // ── Helpers ─────────────────────────────────────────────

  /** Find a booking by ID, returning unified type info */
  private async findBookingById(bookingId: string): Promise<{
    id: string;
    type: 'flight' | 'hotel';
    status: string;
    userId: string;
    amount: number | null;
    currency: string | null;
    agentProfileId: string;
    createdAt: Date;
    supplierPolicies?: unknown[];
  } | null> {
    // Independent PK lookups in parallel; the profile lookup follows the hit.
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
          rateSnapshot: true,
        },
      }),
    ]);
    if (flight && flight.userId) {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { userId: flight.userId },
        select: { id: true },
      });
      return {
        id: flight.id,
        type: 'flight',
        status: flight.status,
        userId: flight.userId,
        amount: flight.amount,
        currency: flight.currency,
        agentProfileId: profile?.id ?? '',
        createdAt: flight.createdAt,
      };
    }

    if (hotel && hotel.userId) {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { userId: hotel.userId },
        select: { id: true },
      });
      return {
        id: hotel.id,
        type: 'hotel',
        status: hotel.status,
        userId: hotel.userId,
        amount: hotel.amount,
        currency: hotel.currency,
        agentProfileId: profile?.id ?? '',
        createdAt: hotel.createdAt,
        supplierPolicies: (hotel.rateSnapshot as any)?.cancellationPolicies ?? [],
      };
    }

    return null;
  }

  /** Calculate refund amount based on cancellation rules */
  private calculateCancellationRefund(booking: {
    type: string;
    amount: number | null;
    createdAt: Date;
    supplierPolicies?: unknown[];
  }): { refundAmount: number; cancellationFee: number } {
    const totalAmount = booking.amount ?? 0;
    if (totalAmount <= 0) return { refundAmount: 0, cancellationFee: 0 };

    // Hotel bookings with supplier policies: use the supplier's own policy
    if (booking.type === 'hotel' && booking.supplierPolicies?.length) {
      const fee = computeHotelCancellationFee(
        booking.supplierPolicies as any,
        totalAmount,
      );
      return { refundAmount: fee.refundAmount, cancellationFee: fee.cancellationFee };
    }

    const hoursSinceBooking =
      (Date.now() - booking.createdAt.getTime()) / (1000 * 60 * 60);
    const daysSinceBooking = hoursSinceBooking / 24;

    // Cancellation fee rules:
    // - Within 24 hours of booking: full refund (free cancellation window)
    // - 1-7 days: 10% fee
    // - 7-30 days: 25% fee
    // - Over 30 days: 50% fee
    // - Flights: $50 minimum fee, Hotels: $25 minimum fee
    let feePercent: number;
    if (hoursSinceBooking <= 24) {
      feePercent = 0; // Free cancellation window
    } else if (daysSinceBooking <= 7) {
      feePercent = 0.1;
    } else if (daysSinceBooking <= 30) {
      feePercent = 0.25;
    } else {
      feePercent = 0.5;
    }

    const minFee = booking.type === 'flight' ? 50 : 25;
    const cancellationFee = Math.max(
      Math.round(totalAmount * feePercent * 100) / 100,
      minFee,
    );
    const refundAmount = Math.max(
      0,
      Math.round((totalAmount - cancellationFee) * 100) / 100,
    );

    return { refundAmount, cancellationFee };
  }

  /** Determine if a credit shell should be used instead of cash refund */
  private shouldUseCreditShell(booking: { type: string }): boolean {
    // Credit shells are used for:
    // - Hotel bookings with non-refundable rates (simulated as 30% chance)
    // - Specific supplier policies
    return booking.type === 'hotel';
  }

  /** Update booking status in the appropriate table */
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

  /** Convert raw booking to a simple result object */
  private toBookingResult(booking: any): any {
    return {
      id: booking.id,
      type: booking.type,
      status: booking.status,
      userId: booking.userId,
      amount: booking.amount,
      currency: booking.currency,
    };
  }

  /**
   * Create a booking with 'pending_payment' status (for card payments via PaymentIntent).
   * Does NOT deduct from wallet — payment is handled by the gateway.
   */
  async createPendingBooking(
    input: CreateBookingInput,
    userId: string,
  ): Promise<{ id: string; bookingId: string; status: string }> {
    if (input.type === 'flight') {
      return this.createFlightBooking(input, userId);
    }
    return this.createHotelBooking(input, userId);
  }

  private async createFlightBooking(
    input: CreateBookingInput,
    userId: string,
  ): Promise<any> {
    const snapshot = input.offerSnapshot ?? {};
    const markupSnapshot = snapshot.basePrice
      ? {
          basePrice: snapshot.basePrice,
          markedUpPrice: input.totalPrice,
          markupPercent: snapshot.markupPercent ?? null,
          appliedRules: snapshot.appliedRules ?? [],
        }
      : undefined;

    const booking = await this.prisma.flightBooking.create({
      data: {
        provider: 'travelport',
        status: 'pending_payment',
        offerSnapshot: snapshot,
        travelerSnapshot: input.travelers ?? [],
        markupSnapshot: markupSnapshot ?? undefined,
        amount: input.totalPrice,
        currency: input.currency ?? 'USD',
        userId,
      },
    });
    return { id: booking.id, bookingId: booking.id, status: 'pending_payment' };
  }

  private async createHotelBooking(
    input: CreateBookingInput,
    userId: string,
  ): Promise<any> {
    // NOTE: status MUST be 'pending_payment' — HotelPaymentListener.confirm()
    // claims bookings in 'pending_payment' and runs the real Hotelbeds booking
    // workflow. A 'pending' status is never claimed: the agent module's local
    // payment.succeeded handler used to flip it to 'confirmed' WITHOUT calling
    // the supplier (no supplier reference) while the listener threw
    // HOTELS_BOOKING_ALREADY_PROCESSED and fired a spurious failure/refund.
    const booking = await this.prisma.hotelBooking.create({
      data: {
        // Persist the supplier this rate came from (search carries it). Falls back
        // to hotelbeds for legacy/manual bookings without a provider hint.
        provider: input.provider ?? 'hotelbeds',
        status: 'pending_payment',
        rateKey: input.rateKey ?? '',
        holder: input.holder ?? {},
        clientReference: input.clientReference ?? `agent-${Date.now()}`,
        paxes: input.paxes ?? [],
        amount: input.totalPrice,
        currency: input.currency ?? 'USD',
        supplierRateId: input.rateKey ?? null,
        supplierReference: null,
        supplierStatus: null,
        searchKey: input.searchKey ?? null,
        userId,
      },
    });
    return { id: booking.id, bookingId: booking.id, status: 'pending_payment' };
  }
}
