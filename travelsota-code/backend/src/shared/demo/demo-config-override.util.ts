import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';

const OVERRIDE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface ConfigOverride {
  field: string;
  value: string;
}

/**
 * Shared utility for demo config overrides.
 * - Extracts/generates a session ID from cookies
 * - Queries DemoConfigOverride table for current session's overrides
 * - Saves credential overrides for demo users (sidesteps real config write)
 */
export class DemoConfigOverrideUtil {
  constructor(private readonly prisma: PrismaService) {}

  /** Extract or generate a session ID from the request cookies */
  ensureSessionId(req: any, res: any): string {
    let sessionId: string = req.cookies?.demo_session_id;

    if (!sessionId) {
      sessionId = randomUUID();
      if (res && typeof res.cookie === 'function') {
        res.cookie('demo_session_id', sessionId, {
          maxAge: OVERRIDE_TTL_MS,
          httpOnly: true,
          sameSite: 'lax' as const,
          path: '/',
        });
      }
    }

    return sessionId;
  }

  /** Check if the authenticated user is one of the 3 demo accounts */
  isDemoUser(user: any, demoEmails: string[]): boolean {
    if (!user?.email) return false;
    return demoEmails.includes(user.email);
  }

  /** Get all overrides for a session + entity type + key */
  async getOverrides(
    sessionId: string,
    entityType: 'provider' | 'gateway',
    entityKey: string,
  ): Promise<ConfigOverride[]> {
    const rows = await this.prisma.demoConfigOverride.findMany({
      where: {
        sessionId,
        entityType,
        entityKey,
        expiresAt: { gt: new Date() },
      },
    });

    return rows.map((r) => ({ field: r.field, value: r.value }));
  }

  /** Save or update overrides for a session (clears old, writes new) */
  async saveOverrides(
    sessionId: string,
    entityType: 'provider' | 'gateway',
    entityKey: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + OVERRIDE_TTL_MS);

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') {
        // Delete any existing override for this field, then create new
        await this.prisma.demoConfigOverride.deleteMany({
          where: { sessionId, entityType, entityKey, field },
        });
        await this.prisma.demoConfigOverride.create({
          data: { sessionId, entityType, entityKey, field, value, expiresAt },
        });
      }
    }
  }

  /** Merge overrides into a config object (overrides take priority) */
  mergeInto(target: Record<string, any>, overrides: ConfigOverride[]): Record<string, any> {
    const merged = { ...target };
    for (const ov of overrides) {
      merged[ov.field] = ov.value;
    }
    return merged;
  }
}
