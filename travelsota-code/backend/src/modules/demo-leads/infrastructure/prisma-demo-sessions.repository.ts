import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { DemoActivity, DemoSession, Prisma } from '../../../generated';

/** Sanity cap: at most 4h of active time can be credited per session. */
export const DEMO_MAX_DURATION_SECONDS = 4 * 3600;

@Injectable()
export class PrismaDemoSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: {
    visitorId: string;
    demoRole: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    country?: string;
    leadId?: string;
  }): Promise<DemoSession> {
    return this.prisma.demoSession.create({ data });
  }

  async findSessionById(id: string): Promise<DemoSession | null> {
    return this.prisma.demoSession.findUnique({ where: { id } });
  }

  /**
   * Heartbeat: advance lastSeenAt and accumulate duration. A gap larger than
   * `maxGapSeconds` (tab suspended / laptop asleep) is NOT counted as active
   * time — it is skipped so sleeping machines don't inflate duration.
   */
  async heartbeat(
    id: string,
    maxGapSeconds: number,
    patch?: { ipAddress?: string; country?: string },
  ): Promise<DemoSession | null> {
    const session = await this.prisma.demoSession.findUnique({ where: { id } });
    if (!session || session.endedAt) return session;

    const now = new Date();
    const gapSeconds = Math.floor(
      (now.getTime() - session.lastSeenAt.getTime()) / 1000,
    );
    // Only count "fresh" gaps as active time; ignore long suspensions.
    const credited =
      gapSeconds > 0 && gapSeconds <= maxGapSeconds ? gapSeconds : 0;
    const durationSeconds = Math.min(
      DEMO_MAX_DURATION_SECONDS,
      session.durationSeconds + Math.max(0, credited),
    );

    return this.prisma.demoSession.update({
      where: { id },
      data: {
        lastSeenAt: now,
        durationSeconds,
        ...(patch?.ipAddress ? { ipAddress: patch.ipAddress } : {}),
        ...(patch?.country ? { country: patch.country } : {}),
      },
    });
  }

  /**
   * Mark session ended. No auth required (called from sendBeacon) — the
   * sessionId is an unguessable UUID and the only effect is freezing stats.
   */
  async endSession(id: string): Promise<DemoSession | null> {
    const session = await this.prisma.demoSession.findUnique({ where: { id } });
    if (!session) return null;

    const now = new Date();
    if (session.endedAt) return session;

    const gapSeconds = Math.floor(
      (now.getTime() - session.lastSeenAt.getTime()) / 1000,
    );
    const credited = gapSeconds > 0 && gapSeconds <= 90 ? gapSeconds : 0;
    const durationSeconds = Math.min(
      DEMO_MAX_DURATION_SECONDS,
      session.durationSeconds + Math.max(0, credited),
    );

    return this.prisma.demoSession.update({
      where: { id },
      data: { endedAt: now, lastSeenAt: now, durationSeconds },
    });
  }

  /**
   * Force-close sessions whose last heartbeat is older than `maxGapSeconds`
   * (the visitor closed the tab without firing the end beacon, went offline,
   * or the beacon was lost). endedAt is frozen at the last real heartbeat —
   * the exact end moment is unknowable, so we keep the honest one and credit
   * no unverified time. Bounded per run; the sweeper calls this every 5 min.
   */
  async endStaleSessions(maxGapSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxGapSeconds * 1000);
    const stale = await this.prisma.demoSession.findMany({
      where: { endedAt: null, lastSeenAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
      orderBy: { lastSeenAt: 'asc' },
    });

    let ended = 0;
    for (const s of stale) {
      try {
        const result = await this.prisma.demoSession.updateMany({
          where: { id: s.id, endedAt: null },
          data: { endedAt: cutoff },
        });
        ended += result.count;
      } catch {
        // One failing row must not stop the sweep.
      }
    }
    return ended;
  }

  /** Link a lead to all not-yet-linked sessions of a visitor. */
  async linkLeadToVisitor(visitorId: string, leadId: string): Promise<number> {
    const result = await this.prisma.demoSession.updateMany({
      where: { visitorId, leadId: null },
      data: { leadId },
    });
    return result.count;
  }

  async findSessions(params: {
    page: number;
    pageSize: number;
    demoRole?: string;
    visitorId?: string;
    since?: Date;
  }) {
    const { page, pageSize, demoRole, visitorId, since } = params;
    const where: Prisma.DemoSessionWhereInput = {};
    if (demoRole) where.demoRole = demoRole;
    if (visitorId) where.visitorId = visitorId;
    if (since) where.loginAt = { gte: since };

    const [items, total] = await Promise.all([
      this.prisma.demoSession.findMany({
        where,
        orderBy: { loginAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.demoSession.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async buildSummary(params: {
    frequentMinLogins7d: number;
    trendDays: number;
  }) {
    const { frequentMinLogins7d, trendDays } = params;
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const sinceTrend = new Date(now.getTime() - trendDays * 24 * 3600 * 1000);
    const staleCutoff = new Date(now.getTime() - 3 * 60 * 1000);

    const [
      totalSessions,
      visitorGroupsAll,
      avgDuration,
      sessions7d,
      sessionsToday,
      activeNow,
      roleBreakdown,
    ] = await Promise.all([
      this.prisma.demoSession.count(),
      this.prisma.demoSession.groupBy({
        by: ['visitorId'],
        _count: { _all: true },
      }),
      this.prisma.demoSession.aggregate({
        _avg: { durationSeconds: true },
        _sum: { durationSeconds: true },
      }),
      this.prisma.demoSession.count({ where: { loginAt: { gte: since7d } } }),
      this.prisma.demoSession.count({
        where: {
          loginAt: {
            gte: new Date(now.getTime() - 24 * 3600 * 1000),
          },
        },
      }),
      // Live now: not ended AND heartbeated within the stale window.
      this.prisma.demoSession.count({
        where: { endedAt: null, lastSeenAt: { gte: staleCutoff } },
      }),
      this.prisma.demoSession.groupBy({
        by: ['demoRole'],
        _count: { _all: true },
        _sum: { durationSeconds: true },
      }),
    ]);

    // ── Daily trend: logins AND active time per day (for stacked chart) ──
    const trendRows = await this.prisma.demoSession.findMany({
      where: { loginAt: { gte: sinceTrend } },
      select: { loginAt: true, durationSeconds: true },
    });
    const loginsByDay = new Map<string, number>();
    const secondsByDay = new Map<string, number>();
    for (const row of trendRows) {
      const day = row.loginAt.toISOString().slice(0, 10);
      loginsByDay.set(day, (loginsByDay.get(day) ?? 0) + 1);
      secondsByDay.set(
        day,
        (secondsByDay.get(day) ?? 0) + (row.durationSeconds ?? 0),
      );
    }
    const trend: Array<{
      date: string;
      logins: number;
      durationSeconds: number;
    }> = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      trend.push({
        date: day,
        logins: loginsByDay.get(day) ?? 0,
        durationSeconds: secondsByDay.get(day) ?? 0,
      });
    }

    // ── Hour-of-day heatmap (last 7 days, UTC) ────────────────────────────
    // Active time is spread uniformly over each session's credited window
    // [lastSeenAt − durationSeconds, lastSeenAt] — heartbeats only credit
    // gaps ≤ 90s, so this window is a good approximation of real activity.
    const heatRows = await this.prisma.demoSession.findMany({
      where: { lastSeenAt: { gte: since7d }, durationSeconds: { gt: 0 } },
      select: { lastSeenAt: true, durationSeconds: true },
    });
    const heat = new Float64Array(168); // 7 days × 24 hours, index = day*24+hour
    for (const row of heatRows) {
      const end = row.lastSeenAt.getTime();
      const start = end - row.durationSeconds * 1000;
      // Walk hour boundaries; proportional split within each hour bucket.
      let cursor = start;
      while (cursor < end) {
        const d = new Date(cursor);
        const hourEnd = Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          d.getUTCHours() + 1,
        );
        const segEnd = Math.min(end, hourEnd);
        const share = (segEnd - cursor) / (end - start);
        const idx = d.getUTCDay() * 24 + d.getUTCHours();
        heat[idx] += row.durationSeconds * share;
        cursor = segEnd;
      }
    }
    const hours: Array<{ day: number; hour: number; seconds: number }> = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        hours.push({
          day,
          hour,
          seconds: Math.round(heat[day * 24 + hour]),
        });
      }
    }

    // ── Country leaderboard (for the globe + list) ────────────────────────
    const countryGroups = await this.prisma.demoSession.groupBy({
      by: ['country'],
      _count: { _all: true },
      _sum: { durationSeconds: true },
      where: { country: { not: null } },
    });
    const countryVisitors = await this.prisma.demoSession.groupBy({
      by: ['country', 'visitorId'],
      _count: { _all: true },
      where: { country: { not: null } },
    });
    const visitorsByCountry = new Map<string, Set<string>>();
    for (const g of countryVisitors) {
      if (!g.country) continue;
      let set = visitorsByCountry.get(g.country);
      if (!set) {
        set = new Set();
        visitorsByCountry.set(g.country, set);
      }
      set.add(g.visitorId);
    }
    const countries = countryGroups
      .filter((g): g is typeof g & { country: string } => !!g.country)
      .map((g) => ({
        country: g.country,
        sessions: g._count._all,
        visitors: visitorsByCountry.get(g.country)?.size ?? 0,
        totalDurationSeconds: g._sum.durationSeconds ?? 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 12);

    // ── Engagement buckets (whole history) ────────────────────────────────
    const durationRows = await this.prisma.demoSession.findMany({
      select: { durationSeconds: true },
    });
    const engagement = { under1m: 0, oneTo5m: 0, fiveTo20m: 0, over20m: 0 };
    for (const row of durationRows) {
      const d = row.durationSeconds;
      if (d < 60) engagement.under1m++;
      else if (d < 300) engagement.oneTo5m++;
      else if (d < 1200) engagement.fiveTo20m++;
      else engagement.over20m++;
    }

    // ── Top visitors (same ranking as before, bounded queries) ────────────
    const visitorGroups = await this.prisma.demoSession.groupBy({
      by: ['visitorId'],
      _count: { _all: true },
      _sum: { durationSeconds: true },
      _max: { loginAt: true },
      orderBy: { _count: { visitorId: 'desc' } },
      take: 50,
    });

    // Logins in last 7d per visitor (for the "frequent" flag).
    const recentGroups = await this.prisma.demoSession.groupBy({
      by: ['visitorId'],
      where: { loginAt: { gte: since7d } },
      _count: { _all: true },
    });
    const recentMap = new Map(
      recentGroups.map((g) => [g.visitorId, g._count._all]),
    );

    // Distinct active days per visitor (top visitors only, bounded query).
    const topVisitorIds = visitorGroups.map((g) => g.visitorId);
    const dayRows = topVisitorIds.length
      ? await this.prisma.demoSession.findMany({
          where: { visitorId: { in: topVisitorIds } },
          select: { visitorId: true, loginAt: true },
        })
      : [];
    const daysMap = new Map<string, Set<string>>();
    for (const row of dayRows) {
      let set = daysMap.get(row.visitorId);
      if (!set) {
        set = new Set();
        daysMap.set(row.visitorId, set);
      }
      set.add(row.loginAt.toISOString().slice(0, 10));
    }

    // Linked leads (emails) for the top visitors — most recent session's lead.
    const leadIdRows = topVisitorIds.length
      ? await this.prisma.demoSession.findMany({
          where: { visitorId: { in: topVisitorIds }, leadId: { not: null } },
          select: { visitorId: true, leadId: true, loginAt: true },
          orderBy: { loginAt: 'desc' },
        })
      : [];
    const leadIdByVisitor = new Map<string, string>();
    for (const row of leadIdRows) {
      if (!leadIdByVisitor.has(row.visitorId) && row.leadId) {
        leadIdByVisitor.set(row.visitorId, row.leadId);
      }
    }
    const leadIds = [...new Set(leadIdByVisitor.values())];
    const leads = leadIds.length
      ? await this.prisma.demoLead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, email: true, name: true, companyName: true },
        })
      : [];
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    // Last IP + country per visitor (most recent session).
    const lastRows = topVisitorIds.length
      ? await this.prisma.demoSession.findMany({
          where: { visitorId: { in: topVisitorIds } },
          select: {
            visitorId: true,
            ipAddress: true,
            country: true,
            loginAt: true,
          },
          orderBy: { loginAt: 'desc' },
        })
      : [];
    const ipByVisitor = new Map<string, string | null>();
    const countryByVisitor = new Map<string, string | null>();
    for (const row of lastRows) {
      if (!ipByVisitor.has(row.visitorId)) {
        ipByVisitor.set(row.visitorId, row.ipAddress);
        countryByVisitor.set(row.visitorId, row.country);
      }
    }

    const topVisitors = visitorGroups.map((g) => {
      const leadId = leadIdByVisitor.get(g.visitorId) ?? null;
      const lead = leadId ? (leadMap.get(leadId) ?? null) : null;
      const logins7d = recentMap.get(g.visitorId) ?? 0;
      return {
        visitorId: g.visitorId,
        logins: g._count._all,
        logins7d,
        totalDurationSeconds: g._sum.durationSeconds ?? 0,
        activeDays: daysMap.get(g.visitorId)?.size ?? 0,
        lastSeenAt: g._max.loginAt?.toISOString() ?? null,
        lastIpAddress: ipByVisitor.get(g.visitorId) ?? null,
        country: countryByVisitor.get(g.visitorId) ?? null,
        lead: lead
          ? {
              id: lead.id,
              email: lead.email,
              name: lead.name,
              companyName: lead.companyName,
            }
          : null,
        frequent:
          logins7d >= frequentMinLogins7d ||
          ((daysMap.get(g.visitorId)?.size ?? 0) >= 2 &&
            (g._sum.durationSeconds ?? 0) >= 600) ||
          !!lead,
      };
    });

    return {
      totals: {
        sessions: totalSessions,
        uniqueVisitors: visitorGroupsAll.length,
        logins7d: sessions7d,
        sessionsToday,
        activeNow,
        avgDurationSeconds: Math.round(avgDuration._avg.durationSeconds ?? 0),
        totalDurationSeconds: avgDuration._sum.durationSeconds ?? 0,
      },
      roles: roleBreakdown.map((r) => ({
        role: r.demoRole,
        logins: r._count._all,
        totalDurationSeconds: r._sum.durationSeconds ?? 0,
      })),
      trend,
      hours,
      countries,
      engagement,
      topVisitors,
    };
  }

  /** Retention pruning — delete sessions older than N days. */
  async pruneOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const result = await this.prisma.demoSession.deleteMany({
      where: { loginAt: { lt: cutoff } },
    });
    return result.count;
  }

  async createActivity(data: {
    sessionId: string;
    visitorId: string;
    type: string;
    label: string;
  }): Promise<DemoActivity> {
    return this.prisma.demoActivity.create({ data });
  }

  async listActivities(params: {
    sessionId?: string;
    visitorId?: string;
    take: number;
  }): Promise<DemoActivity[]> {
    return this.prisma.demoActivity.findMany({
      where: {
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        ...(params.visitorId ? { visitorId: params.visitorId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params.take,
    });
  }

  /**
   * Idempotently make sure the DemoActivity table exists. Older deploys may
   * run a Prisma client that knows the model before the migration reached the
   * database — inserts then fail and activities silently vanish. This DDL
   * mirrors prisma/migrations/…_add_demo_activity exactly and is a no-op once
   * the migration has been applied.
   */
  async ensureDemoActivityTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "DemoActivity" (' +
        '"id" TEXT NOT NULL,' +
        '"sessionId" TEXT NOT NULL,' +
        '"visitorId" TEXT NOT NULL,' +
        '"type" TEXT NOT NULL,' +
        '"label" TEXT NOT NULL,' +
        '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        'CONSTRAINT "DemoActivity_pkey" PRIMARY KEY ("id")' +
        ');',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "DemoActivity_sessionId_createdAt_idx" ' +
        'ON "DemoActivity"("sessionId", "createdAt");',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "DemoActivity_visitorId_createdAt_idx" ' +
        'ON "DemoActivity"("visitorId", "createdAt");',
    );
  }

  /** Live sessions: not ended, heartbeat within the staleness window. */
  async findLiveSessions(take = 50) {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    return this.prisma.demoSession.findMany({
      where: { endedAt: null, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
      take,
    });
  }

  /** One row per visitor: counts of page/api events, most recent label. */
  async countActivitiesByVisitor(visitorIds: string[]) {
    if (visitorIds.length === 0) return [];
    return this.prisma.demoActivity.groupBy({
      by: ['visitorId', 'type'],
      where: { visitorId: { in: visitorIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
  }

  async pruneOldActivities(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const result = await this.prisma.demoActivity.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
