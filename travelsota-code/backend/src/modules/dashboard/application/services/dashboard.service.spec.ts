import { DashboardService } from './dashboard.service';

/**
 * DashboardService.getOverview — aggregate contract tests.
 *
 * The service's Prisma dependency is replaced with a minimal stub; each test
 * selectively stubs the section methods so we can assert the aggregate's
 * failure-isolation semantics without a database.
 */
describe('DashboardService – getOverview (aggregate analytics)', () => {
  const buildService = () => {
    const service = new DashboardService({} as never);
    // Base section stubs (happy path).
    (service as any).getRevenue = jest.fn().mockResolvedValue({
      range: '30d',
      data: [{ label: 'Aug 05', value: 100 }],
    });
    (service as any).getStats = jest.fn().mockResolvedValue({
      totalUsers: 10,
      totalBookings: 20,
      totalRevenue: 300,
      pendingPayments: 2,
      bookingBreakdown: { flights: 12, hotels: 8, flightsBooked: 10, hotelsBooked: 6 },
      paymentBreakdown: { PAID: 18, PENDING: 2 },
      newUsers30d: 3,
      newBookings30d: 4,
      revenue30d: 120,
    });
    (service as any).getBookingsTrend = jest.fn().mockResolvedValue({
      period: 'Last 12 months',
      months: [],
    });
    (service as any).getRevenueBySource = jest.fn().mockResolvedValue({
      period: 'All time',
      summary: { totalRevenue: 300, percentageChange: 12.5 },
      sources: [],
    });
    (service as any).getCustomerInsights = jest.fn().mockResolvedValue({
      period: 'Last 30 days',
      totalCustomers: 10,
      newCustomers: 3,
      returningCustomers: 6,
      vipCustomers: 1,
    });
    (service as any).getTopDestinations = jest.fn().mockResolvedValue({
      period: 'All time',
      products: [],
    });
    return service;
  };

  it('returns every section when all underlying queries succeed', async () => {
    const service = buildService();
    const overview = await service.getOverview();

    expect(overview.stats).toEqual(expect.objectContaining({ totalBookings: 20 }));
    expect(overview.bookingsTrend).toEqual(expect.objectContaining({ period: 'Last 12 months' }));
    expect(overview.revenueTrend).toEqual(expect.objectContaining({ range: '30d' }));
    expect(overview.revenueBySource).toEqual(expect.objectContaining({ summary: expect.anything() }));
    expect(overview.customerInsights).toEqual(expect.objectContaining({ totalCustomers: 10 }));
    expect(overview.topDestinations).toEqual(expect.objectContaining({ period: 'All time' }));
    expect(typeof overview.generatedAt).toBe('string');
  });

  it('degrades a failing section to null instead of failing the whole request', async () => {
    const service = buildService();
    (service as any).getTopDestinations = jest
      .fn()
      .mockRejectedValue(new Error('snapshot query timeout'));

    const overview = await service.getOverview();

    expect(overview.topDestinations).toBeNull();
    // All other sections still resolve — the tab keeps its data.
    expect(overview.stats).toEqual(expect.objectContaining({ totalBookings: 20 }));
    expect(overview.bookingsTrend).not.toBeNull();
    expect(overview.revenueBySource).not.toBeNull();
    expect(overview.customerInsights).not.toBeNull();
    expect(overview.revenueTrend).not.toBeNull();
  });

  it('keeps the whole request alive even when every section fails', async () => {
    const service = buildService();
    for (const m of [
      'getRevenue',
      'getStats',
      'getBookingsTrend',
      'getRevenueBySource',
      'getCustomerInsights',
      'getTopDestinations',
    ]) {
      (service as any)[m] = jest.fn().mockRejectedValue(new Error('db down'));
    }

    const overview = await service.getOverview();

    expect(overview.stats).toBeNull();
    expect(overview.bookingsTrend).toBeNull();
    expect(overview.revenueTrend).toBeNull();
    expect(overview.revenueBySource).toBeNull();
    expect(overview.customerInsights).toBeNull();
    expect(overview.topDestinations).toBeNull();
    // generatedAt still present so clients can reason about freshness.
    expect(typeof overview.generatedAt).toBe('string');
  });

  it('never rejects (catches ProgrammingError-style failures)', async () => {
    const service = buildService();
    (service as any).getStats = jest.fn().mockRejectedValue(new Error('relation "User" does not exist'));
    await expect(service.getOverview()).resolves.toEqual(
      expect.objectContaining({ stats: null, generatedAt: expect.any(String) }),
    );
  });

  it('threads the trend period into the bookings-trend section only', async () => {
    const service = buildService();
    (service as any).getBookingsTrend = jest.fn().mockResolvedValue({ period: 'Last 4 quarters', months: [] });

    await service.getOverview('quarterly');

    expect((service as any).getBookingsTrend).toHaveBeenCalledWith('quarterly');
    // Range-dependent sales trend stays on its dedicated 30d default.
    expect((service as any).getRevenue).toHaveBeenCalledWith('30d');
  });
});

describe('DashboardService – getBookingsTrend (period bucketing)', () => {
  const buildService = (rows: { yr: number; mo: number; cnt: number }[]) => {
    // First raw query = FlightBooking rows, second = HotelBooking rows.
    const service = new DashboardService({
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]),
    } as never);
    return service;
  };

  it('monthly default returns 12 zero-filled month buckets ending at the current month', async () => {
    const now = new Date();
    const service = buildService([{ yr: now.getFullYear(), mo: now.getMonth() + 1, cnt: 5 }]);
    const result = await service.getBookingsTrend();
    expect(result.period).toBe('Last 12 months');
    expect(result.months).toHaveLength(12);
    const expectedLast = now.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    expect(result.months[11].month).toBe(expectedLast);
    expect(result.months[11].flights + result.months[11].hotels).toBe(5);
    expect(result.months[0].flights).toBe(0);
    expect(result.months[0].hotels).toBe(0);
  });

  it('quarterly returns 4 aligned quarter buckets with summed months', async () => {
    const now = new Date();
    // Rows in the current quarter: current month and two months earlier.
    const cur = now.getMonth();
    const qm = [cur, (cur + 11) % 12, (cur + 10) % 12]; // two months back, year-wrapped
    const yr = (off: number) => {
      const d = new Date(now.getFullYear(), cur - off, 1);
      return d.getFullYear();
    };
    const service = buildService([
      { yr: now.getFullYear(), mo: cur + 1, cnt: 4 },
      { yr: yr(1), mo: ((cur + 11) % 12) + 1, cnt: 3 },
    ]);
    void qm;
    const result = await service.getBookingsTrend('quarterly');
    expect(result.period).toBe('Last 4 quarters');
    expect(result.months).toHaveLength(4);

    // Expected labels computed from the clock: walk back 3 quarters from the current one.
    const labels: string[] = [];
    const qIndex = Math.floor(cur / 3);
    for (let i = 3; i >= 0; i--) {
      const qm0 = qIndex * 3 - i * 3;
      const d = new Date(now.getFullYear(), qm0, 1);
      labels.push(`Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`);
    }
    expect(result.months.map((m) => m.month)).toEqual(labels);
    expect(result.months[3].flights + result.months[3].hotels).toBe(7);
  });

  it('annually returns 3 calendar-year buckets ending at the current year', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const service = buildService([
      { yr: y - 2, mo: 5, cnt: 2 },
      { yr: y, mo: 1, cnt: 9 },
    ]);
    const result = await service.getBookingsTrend('annually');
    expect(result.period).toBe('Last 3 years');
    expect(result.months.map((m) => m.month)).toEqual([String(y - 2), String(y - 1), String(y)]);
    expect(result.months[0].flights + result.months[0].hotels).toBe(2);
    expect(result.months[2].flights + result.months[2].hotels).toBe(9);
  });
});
