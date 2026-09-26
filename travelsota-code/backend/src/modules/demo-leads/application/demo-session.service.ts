import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaDemoSessionsRepository } from '../infrastructure/prisma-demo-sessions.repository';
import { PrismaDemoLeadsRepository } from '../infrastructure/prisma-demo-leads.repository';
import type { DemoActivity } from '../../../generated';

type ActivityCountRow = {
  visitorId: string;
  type: 'page' | 'api';
  _count: { _all: number };
  _max: { createdAt: Date | null };
};
import { EmailService } from '../../email/application/email.service';
import { EmailTemplateKey } from '../../email/domain/email-template-key.enum';
import { EmailDispatcherService } from '../../email/application/email-dispatcher.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { BusinessError } from '../../../shared/errors/business-error';
import { DemoGeoService } from './demo-geo.service';

export type DemoRole = 'ADMIN' | 'AGENT' | 'USER';

const HEARTBEAT_MAX_GAP_SECONDS = 90;
// A session with no heartbeat for this long is considered abandoned and is
// force-ended by the sweeper. The pagehide end-beacon handles real exits
// within seconds; this window is deliberately generous (10 min) so phone
// screen-locks and short tab switches do not fragment sessions.
const STALE_SESSION_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_MS = 24 * 3600 * 1000; // cannot heartbeat sessions older than 24h
const RETENTION_DAYS_DEFAULT = 180;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DemoSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoSessionService.name);
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionsRepo: PrismaDemoSessionsRepository,
    private readonly leadsRepo: PrismaDemoLeadsRepository,
    private readonly emailService: EmailService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly config: AppConfigService,
    private readonly geo: DemoGeoService,
  ) {}

  /** Daily retention pruning (DEMO_SESSION_RETENTION_DAYS, default 180). */
  onModuleInit() {
    const days = this.retentionDays;
    this.pruneTimer = setInterval(
      () => {
        this.sessionsRepo
          .pruneOlderThan(days)
          .then((n) => {
            if (n > 0)
              this.logger.log(`Pruned ${n} demo sessions older than ${days}d`);
          })
          .catch((err) =>
            this.logger.warn(
              `Demo session prune failed: ${err instanceof Error ? err.message : err}`,
            ),
          );
        this.sessionsRepo
          .pruneOldActivities(days)
          .then((n) => {
            if (n > 0)
              this.logger.log(
                `Pruned ${n} demo activities older than ${days}d`,
              );
          })
          .catch(() => undefined);
      },
      24 * 3600 * 1000,
    );
    // Prune once shortly after boot as well (deferred to stay out of startup path).
    const bootTimer = setTimeout(() => {
      this.sessionsRepo.pruneOlderThan(days).then(
        (n) => {
          if (n > 0)
            this.logger.log(
              `Pruned ${n} demo sessions older than ${days}d (boot)`,
            );
        },
        () => undefined,
      );
    }, 120_000);
    bootTimer.unref?.();

    // Force-close abandoned sessions every 5 minutes so the admin sees
    // ends within minutes of a visitor leaving (not hours later).
    this.sweepTimer = setInterval(
      () => {
        this.sweepStaleSessions().catch(() => undefined);
      },
      5 * 60 * 1000,
    );
    this.sweepTimer.unref?.();

    // Self-heal the DemoActivity table at boot (no-op once the migration is
    // applied). Fixes deploys where code ships before `migrate deploy` does:
    // activity inserts used to fail silently, so the admin saw no activity.
    setTimeout(() => {
      this.sessionsRepo
        .ensureDemoActivityTable()
        .then(() => this.logger.log('DemoActivity table ready'))
        .catch((err) =>
          this.logger.warn(
            `DemoActivity ensure failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }, 3_000).unref?.();
  }

  /** End every session whose last heartbeat is older than STALE_SESSION_MS. */
  async sweepStaleSessions(): Promise<number> {
    try {
      const count = await this.sessionsRepo.endStaleSessions(
        Math.round(STALE_SESSION_MS / 1000),
      );
      if (count > 0) this.logger.log(`Swept ${count} stale demo session(s)`);
      return count;
    } catch (err) {
      this.logger.warn(
        `Demo session sweep failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  onModuleDestroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private get retentionDays(): number {
    const raw = parseInt(process.env.DEMO_SESSION_RETENTION_DAYS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : RETENTION_DAYS_DEFAULT;
  }

  /**
   * Map a JWT-authenticated user to a demo role, or null if the user is not
   * one of the three configured demo accounts. This is the gate that keeps
   * non-demo users out of the session-tracking surface.
   */
  resolveDemoRole(
    email: string | undefined | null,
  ): { role: DemoRole; userId: string } | null {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const cfg = this.config.demo;
    if (normalized === cfg.adminEmail.trim().toLowerCase())
      return { role: 'ADMIN', userId: '' };
    if (normalized === cfg.agentEmail.trim().toLowerCase())
      return { role: 'AGENT', userId: '' };
    if (normalized === cfg.userEmail.trim().toLowerCase())
      return { role: 'USER', userId: '' };
    return null;
  }

  /** Demo credentials for the login-form prefill (live set from DB, env fallback). */
  async getQuickCredentials() {
    const cfg = this.config.demo;
    // Prefer the persisted row written by DemoResetService at boot/reset —
    // it always matches what login validates against.
    const stored = await this.leadsRepo
      .getCurrentCredentials()
      .catch(() => null);
    return {
      enabled: true,
      credentials: {
        admin: {
          email: stored?.adminEmail ?? cfg.adminEmail,
          password: stored?.adminPassword ?? cfg.adminPassword,
          dashboardUrl: '/admin',
        },
        agent: {
          email: stored?.agentEmail ?? cfg.agentEmail,
          password: stored?.agentPassword ?? cfg.agentPassword,
          dashboardUrl: '/agent',
        },
        user: {
          email: stored?.userEmail ?? cfg.userEmail,
          password: stored?.userPassword ?? cfg.userPassword,
          dashboardUrl: '/',
        },
      },
    };
  }

  /** Create a tracking session for a demo-account login. */
  async startSession(params: {
    demoRole: DemoRole;
    userId: string;
    visitorId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    if (!UUID_RE.test(params.visitorId)) {
      throw new BusinessError('DEMO_SESSIONS_INVALID_VISITOR');
    }
    // Resume an existing live session for this visitor+role instead of
    // stacking a new row per navigation/login (prevents fake 0s sessions and
    // inflated login counts when the demo account is entered twice).
    const resume = await this.sessionsRepo.findLiveSessions(50);
    const existing = resume.find(
      (s) => s.visitorId === params.visitorId && s.demoRole === params.demoRole,
    );
    if (existing) {
      await this.sessionsRepo.heartbeat(existing.id, HEARTBEAT_MAX_GAP_SECONDS);
      return { sessionId: existing.id, resumed: true };
    }

    // Best-effort geolocation (never blocks more than the 2s geo timeout,
    // and failures simply leave country null).
    const country = await this.geo.countryForIp(params.ipAddress);

    // Link any lead that already exists for this visitor (e.g. from the old flow).
    const session = await this.sessionsRepo.createSession({
      visitorId: params.visitorId,
      demoRole: params.demoRole,
      userId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent?.slice(0, 512),
      country: country ?? undefined,
    });
    return {
      sessionId: session.id,
      resumed: false,
    };
  }

  async heartbeat(params: {
    sessionId: string;
    userId: string;
    ipAddress?: string;
  }) {
    const session = await this.sessionsRepo.findSessionById(params.sessionId);
    if (!session) throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    if (session.userId !== params.userId)
      throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    if (session.endedAt) {
      // Sweeper or end-beacon closed it (tab was hidden too long). Tell
      // the client so it can start a fresh session for the live visitor.
      return { ok: false, reason: 'ended' };
    }
    // Track mid-session IP changes (visitor toggled a VPN/network): refresh
    // the stored address and re-resolve the country. Geo is cached per IP,
    // so this only costs a lookup when the address actually changed.
    let patch: { ipAddress: string; country?: string } | undefined;
    if (params.ipAddress && params.ipAddress !== session.ipAddress) {
      const country = await this.geo.countryForIp(params.ipAddress);
      patch = { ipAddress: params.ipAddress, ...(country ? { country } : {}) };
    }

    if (Date.now() - session.loginAt.getTime() > SESSION_MAX_AGE_MS) {
      return { ok: false, reason: 'expired' };
    }
    await this.sessionsRepo.heartbeat(
      session.id,
      HEARTBEAT_MAX_GAP_SECONDS,
      patch,
    );
    return { ok: true };
  }

  /** End a session — auth-free (sendBeacon cannot set headers). */
  async endSession(sessionId: string) {
    if (!UUID_RE.test(sessionId)) {
      throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    }
    await this.sessionsRepo.endSession(sessionId);
    return { ok: true };
  }

  // ── Activity capture (Demo Intelligence → "what did they do?") ─────────
  // Per-process throttle/caches: analytics must stay essentially free.
  private activityThrottle = new Map<string, number>();
  private sessionInfoCache = new Map<
    string,
    { visitorId: string; ended: boolean; at: number }
  >();

  /** Record a page-view (tab opened) reported by the tracker. */
  async recordActivity(params: {
    sessionId: string;
    type: 'page';
    label: string;
  }) {
    if (!UUID_RE.test(params.sessionId)) {
      throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    }
    const session = await this.sessionsRepo.findSessionById(params.sessionId);
    if (!session) throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    if (session.endedAt) return { ok: false, reason: 'ended' };
    // The same tab reported twice within seconds = one navigation bounce.
    const key = `page:${params.sessionId}:${params.label}`;
    const last = this.activityThrottle.get(key);
    if (last && Date.now() - last < 3_000) return { ok: true, throttled: true };
    this.activityThrottle.set(key, Date.now());
    if (this.activityThrottle.size > 4_000) this.activityThrottle.clear();
    await this.sessionsRepo.createActivity({
      sessionId: session.id,
      visitorId: session.visitorId,
      type: 'page',
      label: params.label.slice(0, 300) || '/',
    });
    return { ok: true };
  }

  /**
   * Record an API call made during a demo session (the frontend client
   * stamps x-demo-session-id; DemoActivityInterceptor calls this).
   * Throttled to one row per (session, method, path) per minute.
   */
  async recordApiActivity(sessionId: string, method: string, rawPath: string) {
    if (!UUID_RE.test(sessionId)) return { ok: false };
    const key = `api:${sessionId}:${method}:${rawPath}`;
    const last = this.activityThrottle.get(key);
    if (last && Date.now() - last < 60_000)
      return { ok: true, throttled: true };
    this.activityThrottle.set(key, Date.now());
    if (this.activityThrottle.size > 4_000) this.activityThrottle.clear();

    const now = Date.now();
    let info = this.sessionInfoCache.get(sessionId);
    if (!info || now - info.at > 300_000) {
      const s = await this.sessionsRepo.findSessionById(sessionId);
      info = s
        ? { visitorId: s.visitorId, ended: Boolean(s.endedAt), at: now }
        : { visitorId: '', ended: true, at: now };
      this.sessionInfoCache.set(sessionId, info);
      if (this.sessionInfoCache.size > 1_000) this.sessionInfoCache.clear();
    }
    if (!info.visitorId || info.ended) return { ok: false };

    await this.sessionsRepo.createActivity({
      sessionId,
      visitorId: info.visitorId,
      type: 'api',
      label: `${method} ${rawPath}`.slice(0, 300),
    });
    return { ok: true };
  }

  /** Full activity feed for one session (newest first). */
  async listSessionActivities(sessionId: string) {
    if (!UUID_RE.test(sessionId)) {
      throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    }
    const items = await this.sessionsRepo.listActivities({
      sessionId,
      take: 300,
    });
    return { items };
  }

  /** Activity feed across every session of a visitor (newest first). */
  async listVisitorActivities(visitorId: string) {
    if (!UUID_RE.test(visitorId)) {
      throw new BusinessError('DEMO_SESSIONS_NOT_FOUND');
    }
    const items = await this.sessionsRepo.listActivities({
      visitorId,
      take: 300,
    });
    return { items };
  }

  /**
   * Optional identify-later prompt: attach an email (lead) to an anonymous
   * visitor. Creates a DemoLead and links all of the visitor's sessions.
   */
  async identifyVisitor(params: {
    visitorId: string;
    email: string;
    name?: string;
    companyName?: string;
    whatsappNumber?: string;
    ipAddress?: string;
  }) {
    if (!UUID_RE.test(params.visitorId)) {
      throw new BusinessError('DEMO_SESSIONS_INVALID_VISITOR');
    }
    const email = params.email.trim().toLowerCase();

    // Reuse an existing lead for this email instead of duplicating.
    const existing = await this.leadsRepo.findLeadByEmail(email);
    const lead = existing
      ? ((await this.leadsRepo.updateLeadContact(existing.id, {
          name: params.name,
          companyName: params.companyName,
          whatsappNumber: params.whatsappNumber,
        })) ?? existing)
      : await this.leadsRepo.createLead({
          requestId: randomUUID(),
          email,
          name: params.name,
          companyName: params.companyName,
          whatsappNumber: params.whatsappNumber,
          emailStatus: 'PENDING',
          ipAddress: params.ipAddress,
        });

    const linked = await this.sessionsRepo.linkLeadToVisitor(
      params.visitorId,
      lead.id,
    );

    // Best-effort admin notification — a real sales signal.
    const cfg = this.config.demo;
    const message = await this.emailService
      .createAndQueueEmail({
        type: 'ADMIN_DEMO_LEAD',
        templateKey: EmailTemplateKey.ADMIN_DEMO_LEAD,
        idempotencyKey: `admin-demo-lead-identify:${lead.id}:${params.visitorId}`,
        data: {
          name: params.name,
          companyName: params.companyName,
          email,
          whatsappNumber: params.whatsappNumber,
          emailStatus: 'PENDING',
          linkedSessions: linked,
          requestedAt: new Date().toISOString(),
        },
        recipients: [{ email: cfg.notificationEmail, recipientType: 'admin' }],
      })
      .catch(() => null);

    if (message) {
      this.emailDispatcher.dispatchMessage(message.id).catch((err) => {
        this.logger.error(
          `Failed to dispatch identify notification: ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    return { leadId: lead.id, linkedSessions: linked };
  }

  async listSessions(params: {
    page: number;
    pageSize: number;
    demoRole?: string;
    visitorId?: string;
  }) {
    return this.sessionsRepo.findSessions({
      page: Math.max(1, params.page),
      pageSize: Math.min(200, Math.max(1, params.pageSize)),
      demoRole: params.demoRole,
      visitorId: params.visitorId,
    });
  }

  /** Live "watching right now" feed: active sessions + their latest events. */
  async watchNow() {
    const live = await this.sessionsRepo.findLiveSessions(50);
    const items = await Promise.all(
      live.map(async (s) => {
        const acts: DemoActivity[] = await this.sessionsRepo
          .listActivities({ sessionId: s.id, take: 6 })
          .catch((): DemoActivity[] => []);
        return {
          sessionId: s.id,
          visitorId: s.visitorId,
          role: s.demoRole,
          country: s.country,
          ipAddress: s.ipAddress,
          durationSeconds: s.durationSeconds,
          loginAt: s.loginAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
          recent: acts.map((a) => ({
            type: a.type as 'page' | 'api',
            label: a.label,
            createdAt: a.createdAt.toISOString(),
          })),
        };
      }),
    );
    return { items, updatedAt: new Date().toISOString() };
  }

  /** Total captured events per visitor — surfaced as a column in the admin. */
  private async activityCountsForVisitor(visitorIds: string[]) {
    const rows = await this.sessionsRepo
      .countActivitiesByVisitor([...new Set(visitorIds)])
      .catch((): ActivityCountRow[] => []);
    const map = new Map<string, { events: number; lastAt: string | null }>();
    for (const r of rows) {
      const cur = map.get(r.visitorId) ?? { events: 0, lastAt: null };
      cur.events += r._count._all;
      const at = r._max.createdAt?.toISOString() ?? null;
      if (at && (!cur.lastAt || at > cur.lastAt)) cur.lastAt = at;
      map.set(r.visitorId, cur);
    }
    return map;
  }

  async getSummary() {
    const summary = await this.sessionsRepo.buildSummary({
      frequentMinLogins7d: 3,
      trendDays: 14,
    });
    // Enrich top visitors with captured-activity counts (best-effort: an
    // empty/unmigrated DemoActivity table must never break the summary).
    try {
      const counts = await this.activityCountsForVisitor(
        summary.topVisitors.map((v) => v.visitorId),
      );
      summary.topVisitors = summary.topVisitors.map((v) => ({
        ...v,
        activityCount: counts.get(v.visitorId)?.events ?? 0,
        lastActivityAt: counts.get(v.visitorId)?.lastAt ?? null,
      }));
    } catch {
      /* analytics enrichment only */
    }
    return summary;
  }
}
