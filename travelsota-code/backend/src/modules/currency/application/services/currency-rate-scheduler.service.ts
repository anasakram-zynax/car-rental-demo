import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ExchangeRateService } from './exchange-rate.service';

export interface RateScheduleDto {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface UpdateScheduleInput {
  enabled?: boolean;
  intervalMinutes?: number;
}

const MIN_INTERVAL = 5;
const MAX_INTERVAL = 10_080; // 7 days
const LOCK_TIMEOUT_MINUTES = 15;

@Injectable()
export class CurrencyRateSchedulerService {
  private readonly logger = new Logger(CurrencyRateSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  // ── Read ──

  async getSchedule(): Promise<RateScheduleDto> {
    const row = await this.ensureRow();
    return this.toDto(row);
  }

  // ── Update (admin) ──

  async updateSchedule(input: UpdateScheduleInput): Promise<RateScheduleDto> {
    const data: Record<string, unknown> = {};

    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
    }

    if (input.intervalMinutes !== undefined) {
      if (!Number.isInteger(input.intervalMinutes)) {
        throw new Error('intervalMinutes must be an integer');
      }
      if (input.intervalMinutes < MIN_INTERVAL || input.intervalMinutes > MAX_INTERVAL) {
        throw new Error(`intervalMinutes must be between ${MIN_INTERVAL} and ${MAX_INTERVAL}`);
      }
      data.intervalMinutes = input.intervalMinutes;

      // Recalculate nextRunAt if schedule is (or will be) active
      const current = await this.ensureRow();
      const willBeActive = input.enabled ?? current.enabled;
      if (willBeActive) {
        data.nextRunAt = new Date(Date.now() + input.intervalMinutes * 60_000);
      }
    }

    const row = await this.prisma.currencyRateSchedule.upsert({
      where: { id: (await this.ensureRow()).id },
      create: {
        enabled: (data.enabled as boolean) ?? false,
        intervalMinutes: (data.intervalMinutes as number) ?? 1440,
      },
      update: data as any,
    });

    this.logger.log(
      `Schedule updated: enabled=${row.enabled} interval=${row.intervalMinutes}min nextRunAt=${row.nextRunAt?.toISOString() ?? 'never'}`,
    );

    return this.toDto(row);
  }

  async enableSchedule(): Promise<RateScheduleDto> {
    const current = await this.ensureRow();
    const nextRunAt = new Date(Date.now() + current.intervalMinutes * 60_000);

    const row = await this.prisma.currencyRateSchedule.update({
      where: { id: current.id },
      data: {
        enabled: true,
        nextRunAt,
        lastError: null,
      },
    });

    this.logger.log(`Schedule enabled — next run at ${nextRunAt.toISOString()}`);
    return this.toDto(row);
  }

  async disableSchedule(): Promise<RateScheduleDto> {
    const current = await this.ensureRow();

    const row = await this.prisma.currencyRateSchedule.update({
      where: { id: current.id },
      data: {
        enabled: false,
        nextRunAt: null,
      },
    });

    this.logger.log('Schedule disabled');
    return this.toDto(row);
  }

  async runNow(): Promise<RateScheduleDto> {
    await this.runUpdate('manual');
    return this.getSchedule();
  }

  // ── Interval tick (every 60 seconds) ──

  @Interval(60_000)
  async tick(): Promise<void> {
    if (process.env.CURRENCY_RATE_SCHEDULER_ENABLED === 'false') return;
    const schedule = await this.ensureRow();

    if (!schedule.enabled) {
      return;
    }

    if (!schedule.nextRunAt) {
      return;
    }

    if (schedule.nextRunAt > new Date()) {
      return;
    }

    this.logger.log('Schedule tick — nextRunAt is due, running scheduled update');
    await this.runUpdate('scheduled');
  }

  // ── Internal ──

  private async runUpdate(source: 'manual' | 'scheduled'): Promise<void> {
    const schedule = await this.ensureRow();

    // Attempt to acquire lock (atomic DB update)
    const lockTimeout = new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60_000);
    const locked = await this.prisma.currencyRateSchedule.updateMany({
      where: {
        id: schedule.id,
        OR: [
          { lockedAt: null },
          { lockedAt: { lte: lockTimeout } },
        ],
      },
      data: {
        lockedAt: new Date(),
        lockedBy: `scheduler-${process.pid}`,
        lastStatus: 'running',
      },
    });

    if (locked.count === 0) {
      this.logger.warn('Schedule update skipped — already locked (another run in progress)');
      return;
    }

    // Create audit log entry
    const runRecord = await this.prisma.currencyRateUpdateRun.create({
      data: {
        source,
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      this.logger.log(`Currency update started (source: ${source})`);
      const result = await this.exchangeRateService.updateAllRates(source === 'scheduled' ? 'cron' : 'manual');

      const now = new Date();
      const nextRunAt = new Date(now.getTime() + schedule.intervalMinutes * 60_000);

      await this.prisma.$transaction([
        this.prisma.currencyRateSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt,
            lastStatus: 'success',
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        }),
        this.prisma.currencyRateUpdateRun.update({
          where: { id: runRecord.id },
          data: {
            status: 'success',
            ratesUpdated: result.updated,
            baseCurrency: result.baseCurrency,
            finishedAt: now,
          },
        }),
      ]);

      this.logger.log(`Currency update succeeded — ${result.updated} currencies updated (base: ${result.baseCurrency})`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Currency update failed: ${msg}`);

      const now = new Date();
      const nextRunAt = new Date(now.getTime() + schedule.intervalMinutes * 60_000);

      // Sanitize — strip URLs containing API keys and truncate
      const withoutUrlKeys = msg.replace(/https?:\/\/[^\s]+\/[^\s]+\/[^\s]+/g, '[REDACTED_URL]');
      const sanitized = withoutUrlKeys.length > 500 ? withoutUrlKeys.substring(0, 500) : withoutUrlKeys;

      await this.prisma.$transaction([
        this.prisma.currencyRateSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt,
            lastStatus: 'failed',
            lastError: sanitized,
            lockedAt: null,
            lockedBy: null,
          },
        }),
        this.prisma.currencyRateUpdateRun.update({
          where: { id: runRecord.id },
          data: {
            status: 'failed',
            error: sanitized,
            finishedAt: now,
          },
        }),
      ]);
    }
  }

  /** Get recent update run history */
  async getRunHistory(limit = 20): Promise<{
    id: string;
    source: string;
    status: string;
    ratesUpdated: number | null;
    baseCurrency: string | null;
    error: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  }[]> {
    return this.prisma.currencyRateUpdateRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  private async ensureRow(): Promise<{
    id: string;
    enabled: boolean;
    intervalMinutes: number;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
    lockedAt: Date | null;
    lockedBy: string | null;
  }> {
    const existing = await this.prisma.currencyRateSchedule.findFirst();
    if (existing) return existing;

    const created = await this.prisma.currencyRateSchedule.create({
      data: {
        enabled: false,
        intervalMinutes: 1440,
      },
    });
    return created;
  }

  private toDto(row: {
    enabled: boolean;
    intervalMinutes: number;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
  }): RateScheduleDto {
    return {
      enabled: row.enabled,
      intervalMinutes: row.intervalMinutes,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
    };
  }
}
