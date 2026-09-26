import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { HotelBookingService } from '../../../hotels/application/services/hotel-booking.service';
import { FlightBookingPublicService } from '../../../flights/application/services/flight-booking-public.service';
import type { Prisma } from '../../../../generated';
import { sanitizeBookingReference } from '../../../../shared/booking/booking-reference.util';
import { isFakeLocatorCode } from '../../../../shared/booking/demo-booking-fallback.util';

/**
 * Columns the admin list actually renders. Excludes the large JSON snapshot
 * blobs (offerSnapshot / hotelSnapshot / rateSnapshot / supplierPayload / …)
 * so pagination queries stay light — fetching those multi-MB blobs on every
 * dashboard/table load was blocking the Node event loop and freezing the UI.
 */
const FLIGHT_LIST_SELECT = {
  id: true,
  publicRef: true,
  provider: true,
  status: true,
  locatorCode: true,
  amount: true,
  baseAmount: true,
  currency: true,
  userId: true,
  createdAt: true,
  travelerSnapshot: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.FlightBookingSelect;

const HOTEL_LIST_SELECT = {
  id: true,
  publicRef: true,
  provider: true,
  status: true,
  supplierReference: true,
  hotelbedsRef: true,
  supplierOrderId: true,
  clientReference: true,
  supplierStatus: true,
  hotelbedsStatus: true,
  amount: true,
  currency: true,
  userId: true,
  createdAt: true,
  holder: true,
  paxes: true,
  markupAmount: true,
  supplierAmount: true,
  customerAmount: true,
  customerCurrency: true,
  commissionAmount: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.HotelBookingSelect;

/**
 * Earnings sanity guard (read-side).
 *
 * Bookings created before the stay-total pricing fix (Sep 2) persisted
 * `markupAmount` values computed with the double/nights multiplication —
 * e.g. exactly `amount × 14` on a 14-night booking. Rendering those as
 * "earned" produced absurd admin figures ($775K on a $55K booking).
 *
 * Rule: earnings can never be negative and can never reach the customer
 * total. A corrupt row is reported as null (unknown) instead of a bogus
 * number — bookings created through the corrected preview() path are
 * unaffected because markup < total always holds there.
 */
function sanitizeEarnings(
  markupAmount: unknown,
  total: unknown,
): number | null {
  const markup = Number(markupAmount);
  const customerTotal = Number(total);
  if (!Number.isFinite(markup) || markup <= 0) return null;
  if (!Number.isFinite(customerTotal) || customerTotal <= 0) return null;
  if (markup >= customerTotal) return null;
  return markup;
}
/**
 * ponytail temp: demo fake fallback display. Fake-DEV bookings (locator
 * contains -DEV/) read Confirmed/Paid in the admin table for instant
 * gateways (Stripe/card/PayPal) so demo rows look like real successes. The
 * real Payment row keeps REFUNDED truth (money was returned); revenue
 * queries still exclude fake. Manual gateways (bank/pay-later) keep PENDING.
 * -EXP/ placeholders excluded (no charge attempted). Remove with fake fallback.
 */
function demoFakePaymentDisplay(
  locator: unknown,
  payment: { status?: unknown; gateway?: unknown } | undefined,
): string | null {
  if (typeof locator !== 'string' || !locator.includes('-DEV/')) {
    return (payment?.status as string | undefined) ?? null;
  }
  if (!payment) return null;
  const gw = String(
    (payment.gateway as string | undefined) ?? '',
  ).toUpperCase();
  const manual =
    gw.includes('BANK') ||
    gw.includes('PAY_LATER') ||
    gw.includes('PAYLATER') ||
    gw.includes('MANUAL');
  if (manual) return (payment.status as string | undefined) ?? 'PENDING';
  return 'PAID';
}

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelBookingService: HotelBookingService,
    private readonly flightBookingService: FlightBookingPublicService,
  ) {}

  async getAll(query: {
    type: string;
    page: number;
    limit: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    provider?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: string;
    sortDir?: string;
  }) {
    const { type, page, limit } = query;
    const skip = (page - 1) * limit;
    // Server-side sort allowlist (DTO-validated). Merged + single-type paths
    // all honor it, so column sorts reflect global order, not page order.
    const sortKey: 'createdAt' | 'amount' | 'status' =
      query.sortBy === 'amount' || query.sortBy === 'status'
        ? query.sortBy
        : 'createdAt';
    const sortDir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = {
      [sortKey]: sortDir,
    } as Prisma.FlightBookingOrderByWithRelationInput;

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.fromDate) dateFilter.gte = new Date(query.fromDate);
    if (query.toDate) dateFilter.lte = new Date(query.toDate);

    const flightWhere = this.buildFlightWhere(query, dateFilter);
    const hotelWhere = this.buildHotelWhere(query, dateFilter);

    // Payment has no Prisma relation to bookings (linked by bookingId +
    // bookingType), so resolve the payment-status scoping up front. This lets
    // every branch paginate at the DB level instead of scanning the full table
    // and filtering in memory — the previous approach grew O(total bookings)
    // per request and froze the admin UI on every page/size change.
    const [flightPaymentIds, hotelPaymentIds] = await Promise.all([
      this.getBookingIdsByPaymentStatus('FLIGHT', query.paymentStatus),
      this.getBookingIdsByPaymentStatus('HOTEL', query.paymentStatus),
    ]);
    if (flightPaymentIds) flightWhere.id = { in: flightPaymentIds };
    if (hotelPaymentIds) hotelWhere.id = { in: hotelPaymentIds };

    if (type === 'flights') {
      return this.queryFlights(skip, limit, page, flightWhere, orderBy);
    }
    if (type === 'hotels') {
      return this.queryHotels(
        skip,
        limit,
        page,
        hotelWhere,
        orderBy as Prisma.HotelBookingOrderByWithRelationInput,
      );
    }
    return this.queryAll(skip, limit, page, flightWhere, hotelWhere, {
      key: sortKey,
      dir: sortDir,
    });
  }

  /**
   * Returns the set of booking ids that have at least one payment with the
   * given status (undefined when no payment filter is requested).
   */
  private async getBookingIdsByPaymentStatus(
    bookingType: 'FLIGHT' | 'HOTEL',
    paymentStatus?: string,
  ): Promise<string[] | undefined> {
    if (!paymentStatus) return undefined;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ bookingId: string }>
    >(
      `SELECT DISTINCT "bookingId" FROM "Payment" WHERE "bookingType" = $1 AND "status" = $2`,
      bookingType,
      paymentStatus,
    );
    return rows.map((r) => r.bookingId);
  }

  private buildFlightWhere(
    query: { search?: string; status?: string; provider?: string },
    dateFilter: { gte?: Date; lte?: Date },
  ): Prisma.FlightBookingWhereInput {
    const where: Prisma.FlightBookingWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;
    if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
    if (query.search) {
      const raw = query.search.trim();
      const clean = raw.replace(/^#+/, '').trim();
      const s = clean || raw;
      where.OR = [
        { publicRef: { contains: s, mode: 'insensitive' } },
        { locatorCode: { contains: s, mode: 'insensitive' } },
        { reservationId: { contains: s, mode: 'insensitive' } },
        ...(raw !== s ? [{ publicRef: { contains: raw, mode: 'insensitive' } as const }] : []),
        {
          user: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    return where;
  }

  private buildHotelWhere(
    query: { search?: string; status?: string; provider?: string },
    dateFilter: { gte?: Date; lte?: Date },
  ): Prisma.HotelBookingWhereInput {
    const where: Prisma.HotelBookingWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;
    if (dateFilter.gte || dateFilter.lte) where.createdAt = dateFilter;
    if (query.search) {
      const raw = query.search.trim();
      const clean = raw.replace(/^#+/, '').trim();
      const s = clean || raw;
      where.OR = [
        { publicRef: { contains: s, mode: 'insensitive' } },
        { supplierReference: { contains: s, mode: 'insensitive' } },
        { hotelbedsRef: { contains: s, mode: 'insensitive' } },
        { supplierOrderId: { contains: s, mode: 'insensitive' } },
        { clientReference: { contains: s, mode: 'insensitive' } },
        ...(raw !== s ? [{ publicRef: { contains: raw, mode: 'insensitive' } as const }] : []),
        {
          user: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    return where;
  }

  private async queryAll(
    skip: number,
    limit: number,
    page: number,
    flightWhere: Prisma.FlightBookingWhereInput,
    hotelWhere: Prisma.HotelBookingWhereInput,
    sort: { key: 'createdAt' | 'amount' | 'status'; dir: 'asc' | 'desc' },
  ) {
    // Two-phase merge: (1) scan only {id + sort key} windows from each table
    // — index-covered, no wide rows cross the wire — to decide WHICH bookings
    // make this page; (2) hydrate exactly those rows with the full list
    // select. The previous single-phase version fetched (skip + limit) FULL
    // rows per table and mapped them all to throw most of it away — O(page ×
    // width) work per request that grew with deep pagination.
    const take = skip + limit;
    const orderByWindow = {
      [sort.key]: sort.dir,
    } as Prisma.FlightBookingOrderByWithRelationInput;
    const [flightTotal, hotelTotal, flightWindow, hotelWindow] =
      await Promise.all([
        this.prisma.flightBooking.count({ where: flightWhere }),
        this.prisma.hotelBooking.count({ where: hotelWhere }),
        this.prisma.flightBooking.findMany({
          where: flightWhere,
          orderBy: orderByWindow,
          take,
          select: { id: true, createdAt: true, amount: true, status: true },
        }),
        this.prisma.hotelBooking.findMany({
          where: hotelWhere,
          orderBy: orderByWindow as Prisma.HotelBookingOrderByWithRelationInput,
          take,
          select: { id: true, createdAt: true, amount: true, status: true },
        }),
      ]);

    // Interleave the two id streams in the requested order, then take the
    // page. createdAt serializes to ISO-8601 UTC and status is a plain
    // string, so lexicographic order works; amounts compare numerically
    // with nulls last.
    const pick = (r: {
      createdAt: Date;
      amount: unknown;
      status: string;
    }): number | string => {
      if (sort.key === 'amount') {
        const n = Number(r.amount);
        if (!Number.isFinite(n))
          return sort.dir === 'asc' ? Infinity : -Infinity;
        return n;
      }
      if (sort.key === 'status') return r.status;
      return r.createdAt.toISOString();
    };
    const merged = [
      ...flightWindow.map((r) => ({
        id: r.id,
        sortValue: pick(r),
        type: 'flight' as const,
      })),
      ...hotelWindow.map((r) => ({
        id: r.id,
        sortValue: pick(r),
        type: 'hotel' as const,
      })),
    ].sort((a, b) => {
      const c =
        a.sortValue < b.sortValue ? -1 : a.sortValue > b.sortValue ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
    const pageSlice = merged.slice(skip, skip + limit);

    const flightIds = pageSlice.filter((r) => r.type === 'flight').map((r) => r.id);
    const hotelIds = pageSlice.filter((r) => r.type === 'hotel').map((r) => r.id);

    const [flights, hotels] = await Promise.all([
      flightIds.length > 0
        ? this.prisma.flightBooking.findMany({
            where: { id: { in: flightIds } },
            select: FLIGHT_LIST_SELECT,
          })
        : [],
      hotelIds.length > 0
        ? this.prisma.hotelBooking.findMany({
            where: { id: { in: hotelIds } },
            select: HOTEL_LIST_SELECT,
          })
        : [],
    ]);

    const [mappedFlights, mappedHotels] = await Promise.all([
      this.mapFlightBookings(flights),
      this.mapHotelBookings(hotels),
    ]);

    // Restore the merged sort order for exactly this page's rows.
    const byKey = new Map<string, (typeof mappedFlights)[number] | (typeof mappedHotels)[number]>();
    for (const b of mappedFlights) byKey.set(`flight:${b.id}`, b);
    for (const b of mappedHotels) byKey.set(`hotel:${b.id}`, b);
    const paged = pageSlice
      .map((r) => byKey.get(`${r.type}:${r.id}`))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);

    const total = flightTotal + hotelTotal;

    return {
      bookings: paged,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async queryFlights(
    skip: number,
    limit: number,
    page: number,
    where: Prisma.FlightBookingWhereInput,
    orderBy: Prisma.FlightBookingOrderByWithRelationInput,
  ) {
    const [total, rows] = await Promise.all([
      this.prisma.flightBooking.count({ where }),
      this.prisma.flightBooking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: FLIGHT_LIST_SELECT,
      }),
    ]);

    return {
      bookings: await this.mapFlightBookings(rows),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async queryHotels(
    skip: number,
    limit: number,
    page: number,
    where: Prisma.HotelBookingWhereInput,
    orderBy: Prisma.HotelBookingOrderByWithRelationInput,
  ) {
    const [total, rows] = await Promise.all([
      this.prisma.hotelBooking.count({ where }),
      this.prisma.hotelBooking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: HOTEL_LIST_SELECT,
      }),
    ]);

    return {
      bookings: await this.mapHotelBookings(rows),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Resolves the live (persisted) invoice number + document id for a set of
   * bookings. Returns a Map keyed by bookingId. Ignores voided/cancelled docs.
   */
  private async getInvoiceMap(
    bookingIds: string[],
  ): Promise<
    Map<
      string,
      { invoiceId: string; invoiceNumber: string | null; invoiceStatus: string }
    >
  > {
    if (bookingIds.length === 0) return new Map();
    const docs = await this.prisma.bookingDocument.findMany({
      where: {
        bookingId: { in: bookingIds },
        documentType: 'invoice',
        status: { notIn: ['void', 'cancelled'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, bookingId: true, invoiceNumber: true, status: true },
    });
    const map = new Map<
      string,
      { invoiceId: string; invoiceNumber: string | null; invoiceStatus: string }
    >();
    for (const d of docs) {
      // orderBy desc → first seen per booking is the most recent active invoice
      if (!map.has(d.bookingId)) {
        map.set(d.bookingId, {
          invoiceId: d.id,
          invoiceNumber: d.invoiceNumber,
          invoiceStatus: d.status,
        });
      }
    }
    return map;
  }

  private async mapFlightBookings(bookings: any[]) {
    const bookingIds = bookings.map((b) => b.id);
    const [payments, invoiceMap] = await Promise.all([
      this.prisma.payment.findMany({
        where: { bookingId: { in: bookingIds }, bookingType: 'FLIGHT' },
        orderBy: { createdAt: 'asc' },
        select: {
          bookingId: true,
          status: true,
          gateway: true,
          amount: true,
          currency: true,
        },
      }),
      this.getInvoiceMap(bookingIds),
    ]);
    const paymentMap = new Map(payments.map((p) => [p.bookingId, p]));

    return bookings.map((b) => {
      // For guest bookings (no user), extract details from travelerSnapshot
      const guestUser =
        b.user ??
        (() => {
          const travelers = b.travelerSnapshot as any[] | undefined;
          if (travelers && travelers.length > 0) {
            const lead = travelers[0];
            return {
              id: null,
              firstName: lead.givenName ?? null,
              lastName: lead.surname ?? null,
              email: lead.email ?? null,
            };
          }
          return null;
        })();

      return {
        id: b.id,
        publicRef: b.publicRef ?? null,
        type: 'flight' as const,
        provider: b.provider,
        module: `Flights (${b.provider})`,
        bookingStatus: b.status,
        paymentStatus: demoFakePaymentDisplay(
          b.locatorCode,
          paymentMap.get(b.id),
        ),
        amount: paymentMap.get(b.id)?.amount ?? b.amount,
        currency: paymentMap.get(b.id)?.currency ?? b.currency ?? 'USD',
        // FlightBooking has no markupAmount column — earnings = charged amount
        // minus the pre-markup base persisted at preview time.
        markupAmount: sanitizeEarnings(
          b.baseAmount != null &&
            b.amount != null &&
            Number(b.amount) > Number(b.baseAmount)
            ? Number(b.amount) - Number(b.baseAmount)
            : null,
          paymentMap.get(b.id)?.amount ?? b.amount,
        ),
        pnr: b.locatorCode ?? null,
        invoiceNumber: invoiceMap.get(b.id)?.invoiceNumber ?? null,
        invoiceId: invoiceMap.get(b.id)?.invoiceId ?? null,
        invoiceStatus: invoiceMap.get(b.id)?.invoiceStatus ?? null,
        user: guestUser,
        isGuest: !b.userId,
        createdAt: b.createdAt.toISOString(),
      };
    });
  }

  private async mapHotelBookings(bookings: any[]) {
    const bookingIds = bookings.map((b) => b.id);
    const [payments, invoiceMap] = await Promise.all([
      this.prisma.payment.findMany({
        where: { bookingId: { in: bookingIds }, bookingType: 'HOTEL' },
        orderBy: { createdAt: 'asc' },
        select: {
          bookingId: true,
          status: true,
          gateway: true,
          amount: true,
          currency: true,
        },
      }),
      this.getInvoiceMap(bookingIds),
    ]);
    const paymentMap = new Map(payments.map((p) => [p.bookingId, p]));

    return bookings.map((b) => {
      // For guest bookings (no user), extract details from holder/paxes
      const guestUser =
        b.user ??
        (() => {
          const holder = b.holder;
          if (holder?.name || holder?.surname) {
            return {
              id: null,
              firstName: holder.name ?? null,
              lastName: holder.surname ?? null,
              email: holder.email ?? null,
            };
          }
          const paxes = b.paxes as any[] | undefined;
          if (paxes && paxes.length > 0) {
            const lead = paxes[0];
            return {
              id: null,
              firstName: lead.name ?? null,
              lastName: lead.surname ?? null,
              email: lead.email ?? null,
            };
          }
          return null;
        })();

      return {
        id: b.id,
        type: 'hotel' as const,
        provider: b.provider,
        module: `Hotels (${b.provider})`,
        bookingStatus: b.status,
        paymentStatus: demoFakePaymentDisplay(
          b.supplierReference ?? b.hotelbedsRef,
          paymentMap.get(b.id),
        ),
        amount: paymentMap.get(b.id)?.amount ?? b.amount,
        currency: paymentMap.get(b.id)?.currency ?? b.currency ?? 'USD',
        // Read-side guard: legacy rows with corrupt (over-inflated) markup
        // values render as "unknown" instead of absurd earnings figures.
        markupAmount: sanitizeEarnings(b.markupAmount, paymentMap.get(b.id)?.amount ?? b.amount),
        supplierAmount: b.supplierAmount ?? null,
        customerAmount: b.customerAmount ?? null,
        commissionAmount: b.commissionAmount ?? null,
        publicRef: b.publicRef ?? null,
        // clientReference is a free-form supplier-tracking key — for the
        // public checkout it's literally the guest's email (see
        // (public)/hotels/checkout), so it must never surface as "the
        // reference" as-is. sanitizeBookingReference() strips it only when
        // it's email-shaped; a real non-email clientReference (agent/manual
        // bookings) still shows.
        pnr:
          b.supplierReference ??
          b.hotelbedsRef ??
          b.supplierOrderId ??
          sanitizeBookingReference(b.clientReference) ??
          null,
        supplierReference:
          b.supplierReference ?? b.hotelbedsRef ?? b.supplierOrderId ?? null,
        supplierStatus: b.supplierStatus ?? b.hotelbedsStatus ?? null,
        invoiceNumber: invoiceMap.get(b.id)?.invoiceNumber ?? null,
        invoiceId: invoiceMap.get(b.id)?.invoiceId ?? null,
        invoiceStatus: invoiceMap.get(b.id)?.invoiceStatus ?? null,
        user: guestUser,
        isGuest: !b.userId,
        createdAt: b.createdAt.toISOString(),
      };
    });
  }

  async remove(type: string, id: string) {
    if (type === 'flight') {
      const existing = await this.prisma.flightBooking.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Flight booking not found.');
      const result = await this.flightBookingService.cancelBooking(
        id,
        'Cancelled by admin.',
      );
      return { cancelled: true, type: 'flight', id, ...result };
    }

    const existing = await this.prisma.hotelBooking.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Hotel booking not found.');
    const result = await this.hotelBookingService.cancelBooking(
      id,
      'Cancelled by admin.',
    );
    return { cancelled: true, type: 'hotel', id, ...result };
  }

  /** Hard-delete bookings (and their generated documents). Irreversible. */
  async deleteMany(type: 'flight' | 'hotel' | 'all', ids: string[]) {
    if (ids.length === 0) return { deleted: 0 };
    let deleted = 0;

    if (type === 'flight' || type === 'all') {
      const res = await this.prisma.flightBooking.deleteMany({
        where: { id: { in: ids } },
      });
      deleted += res.count;
      await this.prisma.bookingDocument.deleteMany({
        where: { bookingId: { in: ids }, bookingType: 'FLIGHT' },
      });
    }
    if (type === 'hotel' || type === 'all') {
      const res = await this.prisma.hotelBooking.deleteMany({
        where: { id: { in: ids } },
      });
      deleted += res.count;
      await this.prisma.bookingDocument.deleteMany({
        where: { bookingId: { in: ids }, bookingType: 'HOTEL' },
      });
    }
    return { deleted };
  }

  /**
   * Pull the latest supplier booking state (e.g. Hotelbeds booking detail)
   * and persist it locally. Replaces manual Postman retrieve calls.
   */
  async syncSupplier(id: string) {
    const hotel = await this.prisma.hotelBooking.findUnique({ where: { id } });
    if (!hotel) {
      throw new NotFoundException(
        'Hotel booking not found. Supplier sync is only available for hotel bookings.',
      );
    }
    return this.hotelBookingService.syncSupplierStatus(id);
  }

  /**
   * Change/edit a booked hotel (dates and/or holder). Simulates first, then
   * commits when confirm=true.
   */
  async changeBooking(
    id: string,
    input: {
      checkIn?: string;
      checkOut?: string;
      holder?: { name?: string; surname?: string };
      confirm?: boolean;
    },
  ) {
    const hotel = await this.prisma.hotelBooking.findUnique({ where: { id } });
    if (!hotel) {
      throw new NotFoundException(
        'Hotel booking not found. Changes are only available for hotel bookings.',
      );
    }
    return this.hotelBookingService.changeBooking(id, input);
  }

  /**
   * Admin booking detail: local record + snapshot cancel estimate +
   * cancellation/change event history. Live supplier data arrives only via
   * explicit Refresh (POST :id/sync-supplier), never in this request path.
   */
  async adminBookingDetail(id: string) {
    const hotel = await this.prisma.hotelBooking.findUnique({ where: { id } });
    if (!hotel) {
      throw new NotFoundException('Hotel booking not found.');
    }

    // Reference used for display/sync. Prefer supplierReference (the id shown
    // on the success page / used for cancel + order lookup), fall back to the
    // supplier order id, then the legacy hotelbeds ref. Bookings without a
    // reference (e.g. still pending payment) have nothing to sync.
    const reference =
      hotel.supplierReference ??
      hotel.hotelbedsRef ??
      hotel.supplierOrderId ??
      null;
    // Live supplier retrieve is intentionally OUT of the request path (was up
    // to 3 serial supplier round trips + a 1500ms sleep before responding).
    // Detail serves the local snapshot; the modal Refresh button calls
    // POST :id/sync-supplier first, then refetches.
    const liveError: string | null = null;
    const liveSkipped = reference !== null;

    const payments = await this.prisma.payment.findFirst({
      where: { bookingId: id, bookingType: 'HOTEL' },
      orderBy: { createdAt: 'desc' },
      select: { status: true, gateway: true, amount: true, currency: true },
    });

    const trace = (hotel.workflowTrace ?? {}) as Record<string, any>;
    const events: Array<{ type: string; at: string; detail?: unknown }> = [];
    if (trace.changeSimulatedAt)
      events.push({
        type: 'change_simulated',
        at: trace.changeSimulatedAt,
        detail: trace.changeSimulation,
      });
    if (trace.changedAt)
      events.push({
        type: 'changed',
        at: trace.changedAt,
        detail: trace.changeResult,
      });
    if (trace.cancellationRequestedAt)
      events.push({
        type: 'cancel_requested',
        at: trace.cancellationRequestedAt,
        detail: trace.cancellationResult,
      });
    if (trace.supplierSyncedAt)
      events.push({ type: 'sync', at: trace.supplierSyncedAt });

    const hotelSnapshot = (hotel.hotelSnapshot ?? {}) as Record<string, any>;

    // Cancellation estimate (same computation the cancel modal uses) so the
    // detail modal shows the exact fee/policy text. Guarded: bookings that are
    // already cancelled (or otherwise non-cancellable) have no estimate.
    // Snapshot-only here (no live supplier round trip — see above); the cancel
    // modal calls getCancelEstimate with the default live refresh instead.
    let cancelEstimate: Record<string, unknown> | null = null;
    try {
      cancelEstimate = await this.hotelBookingService.getCancelEstimate(id, {
        refreshLive: false,
      });
    } catch {
      cancelEstimate = null;
    }

    // Hotel-content static-content image lookup was removed with the hotel
    // content ingestion subsystem in this starter kit (supplier-content
    // only) — manual hotels store their own images on the listing itself.
    const hotelImage: string | null = null;

    // Stay dates — snapshots only; live supplier data arrives via explicit
    // Refresh (POST :id/sync-supplier), never in this path.
    const priceSnapshot = (hotel.priceSnapshot ?? {}) as Record<string, any>;
    const supplierPayload = (hotel.supplierPayload ?? {}) as Record<string, any>;
    const checkIn =
      (hotelSnapshot as any)?.checkIn ??
      priceSnapshot.checkIn ??
      supplierPayload.checkIn ??
      null;
    const checkOut =
      (hotelSnapshot as any)?.checkOut ??
      priceSnapshot.checkOut ??
      supplierPayload.checkOut ??
      null;
    // Fake (demo) supplier reference — no live supplier order exists.
    const demoBooking =
      isFakeLocatorCode(reference) || (trace as any)?.demoMode === true;

    return {
      bookingId: id,
      reference,
      localStatus: hotel.status,
      localSupplierStatus: hotel.supplierStatus ?? null,
      amount: hotel.amount ?? hotel.customerAmount ?? null,
      supplierAmount: hotel.supplierAmount ?? null,
      markupAmount: sanitizeEarnings(hotel.markupAmount, hotel.amount ?? hotel.customerAmount),
      customerAmount: hotel.customerAmount ?? null,
      currency: hotel.currency ?? hotel.customerCurrency ?? 'USD',
      paymentStatus: demoFakePaymentDisplay(reference, payments ?? undefined),
      createdAt: hotel.createdAt,
      holder: hotel.holder ?? null,
      paxes: hotel.paxes ?? null,
      hotelName: hotelSnapshot.name ?? (hotel.rateSnapshot as any)?.hotelName ?? null,
      hotelImage,
      checkIn,
      checkOut,
      rateSnapshot: hotel.rateSnapshot ?? null,
      events,
      cancelEstimate,
      live: null,
      liveError,
      liveSkipped,
      demoBooking,
      liveFetchedAt: new Date().toISOString(),
      // RateHawk confirmation polling status
      provider: hotel.provider ?? null,
      partnerOrderId: hotel.partnerOrderId ?? null,
      supplierOrderId: hotel.supplierOrderId ?? null,
      hotelConfirmationStatus: hotel.hotelConfirmationStatus ?? null,
      hotelConfirmationNumber: hotel.hotelConfirmationNumber ?? null,
      hotelConfirmationAttempts: hotel.hotelConfirmationAttempts ?? 0,
      hotelConfirmationLastCheckedAt: hotel.hotelConfirmationLastCheckedAt?.toISOString() ?? null,
      hotelConfirmationNextCheckAt: hotel.hotelConfirmationNextCheckAt?.toISOString() ?? null,
      // Poll history — every scheduled + manual poll attempt with outcome
      pollHistory: Array.isArray(trace.pollHistory) ? trace.pollHistory : [],
      // Nights breakdown so the UI can show per-night AND total consistently.
      nightCount:
        checkIn && checkOut
          ? Math.max(1, Math.round(
              (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
            ))
          : null,
    };
  }
}
