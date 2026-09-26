import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Reporting currency for every money aggregate below: the platform default
   * currency (ops-inspector semantics — the admin dashboard never converts to
   * the viewing admin's display selection). Payments/bookings are charged in
   * mixed supplier currencies, so raw SUM(amount) would add INR to USD.
   * Every sum converts through the Currency table instead.
   */
  private async reportingCurrency(): Promise<{ code: string; rate: number }> {
    // listActive() is already 60s-cached inside CurrencyService.
    const actives = await this.currencyService.listActive();
    const def =
      actives.find((c: any) => c.isDefault) ??
      actives.find((c: any) => c.isBase) ??
      actives[0];
    const rate = Number(def?.exchangeRate);
    return {
      code: def?.code ?? 'USD',
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
    };
  }

  async getStats() {
    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const reporting = await this.reportingCurrency();

    const [countsRows, paymentStatsRows, paymentStatuses] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{
        total_users: number;
        total_flights: number;
        total_hotels: number;
        flights_booked: number;
        hotels_booked: number;
        new_users_30d: number;
        new_flights_30d: number;
        new_hotels_30d: number;
        new_users_7d: number;
        new_flights_7d: number;
        new_hotels_7d: number;
        new_users_365d: number;
        new_flights_365d: number;
        new_hotels_365d: number;
      }>>(
        `SELECT
          (SELECT COUNT(*) FROM "User" WHERE "userType" = 'CUSTOMER' AND "deletedAt" IS NULL)::int AS total_users,
          (SELECT COUNT(*) FROM "FlightBooking")::int AS total_flights,
          (SELECT COUNT(*) FROM "HotelBooking")::int AS total_hotels,
          (SELECT COUNT(*) FROM "FlightBooking" WHERE status = 'booked')::int AS flights_booked,
          (SELECT COUNT(*) FROM "HotelBooking" WHERE status = 'booked')::int AS hotels_booked,

          (SELECT COUNT(*) FROM "User" WHERE "userType" = 'CUSTOMER' AND "deletedAt" IS NULL AND "createdAt" >= $1)::int AS new_users_30d,
          (SELECT COUNT(*) FROM "FlightBooking" WHERE "createdAt" >= $1)::int AS new_flights_30d,
          (SELECT COUNT(*) FROM "HotelBooking" WHERE "createdAt" >= $1)::int AS new_hotels_30d,

          (SELECT COUNT(*) FROM "User" WHERE "userType" = 'CUSTOMER' AND "deletedAt" IS NULL AND "createdAt" >= $2)::int AS new_users_7d,
          (SELECT COUNT(*) FROM "FlightBooking" WHERE "createdAt" >= $2)::int AS new_flights_7d,
          (SELECT COUNT(*) FROM "HotelBooking" WHERE "createdAt" >= $2)::int AS new_hotels_7d,

          (SELECT COUNT(*) FROM "User" WHERE "userType" = 'CUSTOMER' AND "deletedAt" IS NULL AND "createdAt" >= $3)::int AS new_users_365d,
          (SELECT COUNT(*) FROM "FlightBooking" WHERE "createdAt" >= $3)::int AS new_flights_365d,
          (SELECT COUNT(*) FROM "HotelBooking" WHERE "createdAt" >= $3)::int AS new_hotels_365d`,
        last30,
        last7,
        last365,
      ),
      this.prisma.$queryRawUnsafe<Array<{
        total_revenue: number;
        revenue_30d: number;
        revenue_7d: number;
        revenue_365d: number;
        pending_count: number;
      }>>(
        `SELECT
          COALESCE((SELECT SUM(COALESCE(p.amount * ($2 / NULLIF(c."exchangeRate", 0)), p.amount)) FROM "Payment" p LEFT JOIN "Currency" c ON c.code = p.currency WHERE p.status = 'PAID'), 0) AS total_revenue,
          COALESCE((SELECT SUM(COALESCE(p.amount * ($2 / NULLIF(c."exchangeRate", 0)), p.amount)) FROM "Payment" p LEFT JOIN "Currency" c ON c.code = p.currency WHERE p.status = 'PAID' AND p."createdAt" >= $1), 0) AS revenue_30d,
          COALESCE((SELECT SUM(COALESCE(p.amount * ($2 / NULLIF(c."exchangeRate", 0)), p.amount)) FROM "Payment" p LEFT JOIN "Currency" c ON c.code = p.currency WHERE p.status = 'PAID' AND p."createdAt" >= $3), 0) AS revenue_7d,
          COALESCE((SELECT SUM(COALESCE(p.amount * ($2 / NULLIF(c."exchangeRate", 0)), p.amount)) FROM "Payment" p LEFT JOIN "Currency" c ON c.code = p.currency WHERE p.status = 'PAID' AND p."createdAt" >= $4), 0) AS revenue_365d,
          (SELECT COUNT(*) FROM "Payment" WHERE status = 'PENDING')::int AS pending_count`,
        last30,
        reporting.rate,
        last7,
        last365,
      ),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const counts = countsRows[0];
    const paymentStats = paymentStatsRows[0];

    const paymentBreakdown: Record<string, number> = {};
    for (const row of paymentStatuses) {
      paymentBreakdown[row.status] = row._count.id;
    }

    const totalBookings = counts.total_flights + counts.total_hotels;
    const bookings7d = counts.new_flights_7d + counts.new_hotels_7d;
    const bookings30d = counts.new_flights_30d + counts.new_hotels_30d;
    const bookings365d = counts.new_flights_365d + counts.new_hotels_365d;

    const totalRev = Math.round(Number(paymentStats.total_revenue) * 100) / 100;
    const rev7d = Math.round(Number(paymentStats.revenue_7d) * 100) / 100;
    const rev30d = Math.round(Number(paymentStats.revenue_30d) * 100) / 100;
    const rev365d = Math.round(Number(paymentStats.revenue_365d) * 100) / 100;

    const periods = {
      all: {
        totalRevenue: totalRev,
        totalBookings,
        avgBookingValue: totalBookings > 0 ? Math.round((totalRev / totalBookings) * 100) / 100 : 0,
        totalUsers: counts.total_users,
      },
      week: {
        totalRevenue: rev7d,
        totalBookings: bookings7d,
        avgBookingValue: bookings7d > 0 ? Math.round((rev7d / bookings7d) * 100) / 100 : 0,
        totalUsers: counts.new_users_7d,
      },
      month: {
        totalRevenue: rev30d,
        totalBookings: bookings30d,
        avgBookingValue: bookings30d > 0 ? Math.round((rev30d / bookings30d) * 100) / 100 : 0,
        totalUsers: counts.new_users_30d,
      },
      year: {
        totalRevenue: rev365d,
        totalBookings: bookings365d,
        avgBookingValue: bookings365d > 0 ? Math.round((rev365d / bookings365d) * 100) / 100 : 0,
        totalUsers: counts.new_users_365d,
      },
    };

    return {
      totalUsers: counts.total_users,
      totalBookings,
      totalRevenue: totalRev,
      revenueCurrency: reporting.code,
      pendingPayments: paymentStats.pending_count,
      bookingBreakdown: {
        flights: counts.total_flights,
        hotels: counts.total_hotels,
        flightsBooked: counts.flights_booked,
        hotelsBooked: counts.hotels_booked,
      },
      paymentBreakdown,
      newUsers30d: counts.new_users_30d,
      newBookings30d: bookings30d,
      revenue30d: rev30d,
      periods,
    };
  }

  async getRevenue(range: '30d' | 'quarterly' | 'annually') {
    const now = new Date();
    const reporting = await this.reportingCurrency();
    let startDate: Date;
    let labelFormat: 'day' | 'month';

    switch (range) {
      case 'quarterly':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        labelFormat = 'month';
        break;
      case 'annually':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        labelFormat = 'month';
        break;
      default: // 30d
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        labelFormat = 'day';
    }

    if (labelFormat === 'day') {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(
        `SELECT TO_CHAR(d.day, 'Mon DD') AS label, COALESCE(SUM(COALESCE(p.amount * ($3 / NULLIF(c."exchangeRate", 0)), p.amount)), 0) AS value
         FROM generate_series($1::date, $2::date, '1 day'::interval) AS d(day)
         LEFT JOIN "Payment" p ON p."createdAt"::date = d.day AND p.status = 'PAID'
         LEFT JOIN "Currency" c ON c.code = p.currency
         GROUP BY d.day
         ORDER BY d.day`,
        startDate,
        now,
        reporting.rate,
      );
      return { range, currency: reporting.code, data: rows.map((r) => ({ label: r.label, value: Math.round(Number(r.value) * 100) / 100 })) };
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(
      `SELECT TO_CHAR(d.month, 'Mon ''YY') AS label, COALESCE(SUM(COALESCE(p.amount * ($3 / NULLIF(c."exchangeRate", 0)), p.amount)), 0) AS value
       FROM generate_series($1::date, $2::date, '1 month'::interval) AS d(month)
       LEFT JOIN "Payment" p ON p."createdAt" >= d.month AND p."createdAt" < d.month + '1 month'::interval AND p.status = 'PAID'
       LEFT JOIN "Currency" c ON c.code = p.currency
       GROUP BY d.month
       ORDER BY d.month`,
      startDate,
      now,
      reporting.rate,
    );
    return { range, currency: reporting.code, data: rows.map((r) => ({ label: r.label, value: Math.round(Number(r.value) * 100) / 100 })) };
  }

  async getRecentActivity(limit = 15) {
    const payments = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Resolve customer names from the owning booking's user (best effort).
    const flightIds = payments
      .filter((p) => p.bookingType === 'FLIGHT')
      .map((p) => p.bookingId);
    const hotelIds = payments
      .filter((p) => p.bookingType === 'HOTEL')
      .map((p) => p.bookingId);

    const [flightBookings, hotelBookings] = await Promise.all([
      flightIds.length
        ? this.prisma.flightBooking.findMany({
            where: { id: { in: flightIds } },
            select: { id: true, userId: true },
          })
        : Promise.resolve([]),
      hotelIds.length
        ? this.prisma.hotelBooking.findMany({
            where: { id: { in: hotelIds } },
            select: { id: true, userId: true },
          })
        : Promise.resolve([]),
    ]);

    const userIds = new Set<string>();
    for (const b of [...flightBookings, ...hotelBookings]) {
      if (b.userId) userIds.add(b.userId);
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const bookingUserMap = new Map<string, (typeof users)[0] | undefined>();
    for (const b of flightBookings) bookingUserMap.set(b.id, b.userId ? userMap.get(b.userId) : undefined);
    for (const b of hotelBookings) bookingUserMap.set(b.id, b.userId ? userMap.get(b.userId) : undefined);

    return payments.map((p) => {
      const user = bookingUserMap.get(p.bookingId);
      const customerName = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        : null;
      return {
        id: p.id,
        reference: p.reference,
        type: p.bookingType,
        gateway: p.gateway,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        customerName,
      };
    });
  }

  /**
   * Bookings split by Flights vs Hotels (stacked bar feed).
   * monthly: last 12 months (default), quarterly: last 4 quarters (aligned
   * to the current quarter), annually: last 3 calendar years. Buckets are
   * zero-filled so the chart never skips empty periods.
   */
  async getBookingsTrend(period: 'monthly' | 'quarterly' | 'annually' = 'monthly') {
    const now = new Date();
    let start: Date;
    let bucketCount: number;
    let stepMonths: number;

    switch (period) {
      case 'quarterly':
        // Align to the current quarter, then walk back three more quarters.
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 9, 1);
        bucketCount = 4;
        stepMonths = 3;
        break;
      case 'annually':
        start = new Date(now.getFullYear() - 2, 0, 1);
        bucketCount = 3;
        stepMonths = 12;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        bucketCount = 12;
        stepMonths = 1;
    }

    // Parallel — was two sequential roundtrips (~1.8s on remote DB).
    const [flightRows, hotelRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ yr: number; mo: number; cnt: number }>>(
        `SELECT EXTRACT(YEAR FROM "createdAt")::int AS yr, EXTRACT(MONTH FROM "createdAt")::int AS mo, COUNT(*)::int AS cnt
         FROM "FlightBooking"
         WHERE "createdAt" >= $1
         GROUP BY yr, mo
         ORDER BY yr, mo`,
        start,
      ),
      this.prisma.$queryRawUnsafe<Array<{ yr: number; mo: number; cnt: number }>>(
        `SELECT EXTRACT(YEAR FROM "createdAt")::int AS yr, EXTRACT(MONTH FROM "createdAt")::int AS mo, COUNT(*)::int AS cnt
         FROM "HotelBooking"
         WHERE "createdAt" >= $1
         GROUP BY yr, mo
         ORDER BY yr, mo`,
        start,
      ),
    ]);

    const flightMap = new Map<string, number>();
    for (const r of flightRows) {
      flightMap.set(`${r.yr}-${r.mo}`, r.cnt);
    }
    const hotelMap = new Map<string, number>();
    for (const r of hotelRows) {
      hotelMap.set(`${r.yr}-${r.mo}`, r.cnt);
    }

    const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;
    const bucketLabel = (d: Date, monthsPerBucket: number) => {
      if (monthsPerBucket === 12) return String(d.getFullYear());
      if (monthsPerBucket === 3) return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    const months: { month: string; flights: number; hotels: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = new Date(start.getFullYear(), start.getMonth() + i * stepMonths, 1);
      let flights = 0;
      let hotels = 0;
      for (let s = 0; s < stepMonths; s++) {
        const md = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + s, 1);
        flights += flightMap.get(monthKey(md)) ?? 0;
        hotels += hotelMap.get(monthKey(md)) ?? 0;
      }
      months.push({
        month: bucketLabel(bucketStart, stepMonths),
        flights,
        hotels,
      });
    }

    const periodLabel =
      period === 'quarterly' ? 'Last 4 quarters' : period === 'annually' ? 'Last 3 years' : 'Last 12 months';
    return { period: periodLabel, months };
  }

  /**
   * Revenue split by booking type (Flights vs Hotels) from PAID payments.
   * percentageChange is a genuine 30d-vs-previous-30d delta per source.
   */
  async getRevenueBySource() {
    const now = Date.now();
    const last30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const reporting = await this.reportingCurrency();
    // Group by currency too — amounts in different currencies must be
    // converted into the reporting currency BEFORE summing (convert-then-sum).
    const [all, recent, previous] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['bookingType', 'currency'],
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['bookingType', 'currency'],
        where: { status: 'PAID', createdAt: { gte: last30 } },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['bookingType', 'currency'],
        where: { status: 'PAID', createdAt: { gte: prev30, lt: last30 } },
        _sum: { amount: true },
      }),
    ]);

    const transformed = await Promise.all(
      [all, recent, previous].map(async (rows) => {
        // Converted per-row first, grouped after — accumulating into a shared
        // Map inside Promise.all workers is a read-modify-write race when two
        // rows share a bookingType (e.g. USD + EUR flights).
        const converted = await Promise.all(
          rows.map(async (row) => {
            const raw = Number(row._sum?.amount ?? 0);
            if (!raw) return null;
            let amount = raw;
            try {
              amount = (
                await this.currencyService.convert(raw, row.currency, reporting.code)
              ).amount;
            } catch {
              // Unknown currency — count raw (same fallback as the SQL sums).
            }
            return { bookingType: row.bookingType, amount };
          }),
        );
        const perType = new Map<string, number>();
        for (const entry of converted) {
          if (!entry) continue;
          perType.set(entry.bookingType, (perType.get(entry.bookingType) ?? 0) + entry.amount);
        }
        return perType;
      }),
    );
    const [allByType, recentByType, previousByType] = transformed;

    const sumMap = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const totalRevenue = round2(sumMap(allByType));
    const recentRevenue = sumMap(recentByType);
    const previousRevenue = sumMap(previousByType);
    const percentageChange =
      previousRevenue > 0
        ? Math.round((((recentRevenue - previousRevenue) / previousRevenue) * 100) * 100) / 100
        : 0;

    const palette = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
    const sources = [...allByType.entries()].map(([bookingType, value], i) => ({
      name: bookingType === 'HOTEL' ? 'Hotels' : bookingType === 'FLIGHT' ? 'Flights' : bookingType,
      value: round2(value),
      percentage: totalRevenue > 0 ? value / totalRevenue : 0,
      fill: palette[i % palette.length],
    }));

    return {
      period: 'All time',
      currency: reporting.code,
      summary: { totalRevenue, percentageChange },
      sources,
    };
  }

  /**
   * Customer insights: total / new (30d) / returning (with bookings) / vip (5+ bookings).
   */
  async getCustomerInsights() {
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalCustomers, newCustomers, flightUsers, hotelUsers] = await Promise.all([
      this.prisma.user.count({ where: { userType: 'CUSTOMER', deletedAt: null } }),
      this.prisma.user.count({ where: { userType: 'CUSTOMER', deletedAt: null, createdAt: { gte: last30 } } }),
      this.prisma.flightBooking.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.hotelBooking.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const bookingCounts = new Map<string, number>();
    for (const row of [...flightUsers, ...hotelUsers]) {
      if (!row.userId) continue;
      bookingCounts.set(row.userId, (bookingCounts.get(row.userId) ?? 0) + row._count.id);
    }

    let returningCustomers = 0;
    let vipCustomers = 0;
    for (const count of bookingCounts.values()) {
      if (count >= 1) returningCustomers++;
      if (count >= 5) vipCustomers++;
    }

    return {
      period: 'Last 30 days',
      totalCustomers,
      newCustomers,
      returningCustomers,
      vipCustomers,
    };
  }

  /**
   * Top travel products: top flight routes + top hotels by booking count & revenue.
   * Aggregated in Postgres (JSON operators) so we never ship the full snapshot
   * blobs to Node — the previous unbounded findMany blew past the 30s query
   * timeout on real data.
   */
  async getTopDestinations() {
    const reporting = await this.reportingCurrency();
    const [flightRows, hotelRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ name: string; count: number; revenue: number }>>(
        `SELECT
           CASE
             WHEN "offerSnapshot"->>'from' IS NOT NULL AND "offerSnapshot"->>'to' IS NOT NULL
               THEN ("offerSnapshot"->>'from') || ' → ' || ("offerSnapshot"->>'to')
             WHEN "offerSnapshot"->>'route' IS NOT NULL THEN "offerSnapshot"->>'route'
             ELSE 'Flight'
           END AS name,
           COUNT(*)::int AS count,
           COALESCE(SUM(COALESCE("FlightBooking"."amount" * ($1 / NULLIF("Currency"."exchangeRate", 0)), "FlightBooking"."amount")), 0) AS revenue
         FROM "FlightBooking"
         LEFT JOIN "Currency" ON "Currency".code = "FlightBooking".currency
         WHERE "offerSnapshot" IS NOT NULL
           AND ("offerSnapshot"->>'from' IS NOT NULL OR "offerSnapshot"->>'route' IS NOT NULL)
         GROUP BY name
         ORDER BY count DESC
         LIMIT 10`,
        reporting.rate,
      ),
      this.prisma.$queryRawUnsafe<Array<{ name: string; count: number; revenue: number }>>(
        `SELECT
           COALESCE("hotelSnapshot"->>'name', 'Hotel') AS name,
           COUNT(*)::int AS count,
           COALESCE(SUM(COALESCE("HotelBooking"."amount" * ($1 / NULLIF("Currency"."exchangeRate", 0)), "HotelBooking"."amount")), 0) AS revenue
         FROM "HotelBooking"
         LEFT JOIN "Currency" ON "Currency".code = "HotelBooking".currency
         WHERE "hotelSnapshot" IS NOT NULL AND "hotelSnapshot"->>'name' IS NOT NULL
         GROUP BY name
         ORDER BY count DESC
         LIMIT 10`,
        reporting.rate,
      ),
    ]);

    const products: { name: string; type: 'flight' | 'hotel'; sales: number; revenue: number }[] = [
      ...flightRows.map((r) => ({
        name: r.name,
        type: 'flight' as const,
        sales: r.count,
        revenue: Math.round(r.revenue * 100) / 100,
      })),
      ...hotelRows.map((r) => ({
        name: r.name,
        type: 'hotel' as const,
        sales: r.count,
        revenue: Math.round(r.revenue * 100) / 100,
      })),
    ];

    products.sort((a, b) => b.sales - a.sales);

    // Keep a generous merged window (12) so the flight-only Top Destinations
    // widget can always fill its top-5 even when hotels dominate the ranking.
    return {
      period: 'All time',
      currency: reporting.code,
      products: products.slice(0, 12).map((p, i) => ({ ...p, order: i + 1 })),
    };
  }

  /**
   * Aggregate analytics overview for the admin Dashboard tab.
   *
   * The tab used to fire SIX dashboard endpoints on mount (stats,
   * bookings-trend, revenue-by-source, revenue, customer-insights,
   * top-destinations) — each paying its own connection + auth + DB latency
   * against a remote database. This single endpoint runs all sections in ONE
   * parallel batch, so wall time is bounded by the slowest section instead of
   * the sum of six requests.
   *
   * Edge cases handled:
   * - Partial failure: every section resolves through Promise.allSettled. One
   *   failing aggregate (e.g. a snapshot query timing out) degrades to
   *   `{ section: null, error: true }` while all other sections still return
   *   200 — the UI's provisional/fallback rendering stays intact.
   * - Independent caching: TtlCacheInterceptor caches per-URL, so this
   *   endpoint gets its own TTL + stale-while-revalidate entry.
   * - Isolation: the original endpoints are untouched — other consumers keep
   *   working, and this method reuses the exact same query logic.
   * - The sales-trend chart keeps its dedicated endpoint: switching its
   *   range must not recompute every section. The bookings-trend period IS
   *   threaded through — only that section recomputes on a period switch.
   */
  async getOverview(period: 'monthly' | 'quarterly' | 'annually' = 'monthly') {
    const [revenueTrend, stats, bookingsTrend, revenueBySource, customerInsights, topDestinations] =
      await Promise.allSettled([
        this.getRevenue('30d'),
        this.getStats(),
        this.getBookingsTrend(period),
        this.getRevenueBySource(),
        this.getCustomerInsights(),
        this.getTopDestinations(),
      ]);

    const section = <T>(result: PromiseSettledResult<T>, name: string): T | null => {
      if (result.status === 'fulfilled') return result.value;
      // Log for observability, but never fail the whole overview for one section.
      console.error(`[dashboard-overview] section '${name}' failed:`, result.reason);
      return null;
    };

    return {
      revenueTrend: section(revenueTrend, 'revenueTrend'),
      stats: section(stats, 'stats'),
      bookingsTrend: section(bookingsTrend, 'bookingsTrend'),
      revenueBySource: section(revenueBySource, 'revenueBySource'),
      customerInsights: section(customerInsights, 'customerInsights'),
      topDestinations: section(topDestinations, 'topDestinations'),
      generatedAt: new Date().toISOString(),
    };
  }
}
