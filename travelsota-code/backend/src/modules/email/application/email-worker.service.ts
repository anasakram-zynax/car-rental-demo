import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailDispatcherService } from './email-dispatcher.service';
import { PrismaEmailRepository } from '../infrastructure/prisma-email.repository';
import { PostgresAdvisoryLockService } from '../../../shared/locks/postgres-advisory-lock.service';

@Injectable()
export class EmailWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EmailWorkerService.name);
  private ready = false;
  private dispatchRunning = false;

  constructor(
    private readonly dispatcher: EmailDispatcherService,
    private readonly repo: PrismaEmailRepository,
    private readonly lockService: PostgresAdvisoryLockService,
  ) {}

  onModuleInit() {
    if (process.env.ENABLE_EMAIL_WORKER !== 'true') {
      this.logger.log('Email worker disabled for this process (ENABLE_EMAIL_WORKER != true)');
      return;
    }
    void this.init();
  }

  private async init() {
    try {
      const count = await this.repo.getRuleCount();
      if (count === 0) {
        this.logger.log('No email rules found — seeding defaults');
        await this.repo.seedDefaultRules();
      }
      this.ready = true;
      this.logger.log('Email worker ready');
    } catch (err: unknown) {
      this.logger.warn(
        `Email worker disabled — tables not ready: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleDispatch() {
    if (process.env.ENABLE_EMAIL_WORKER !== 'true') return;
    if (!this.ready) return;
    if (this.dispatchRunning) return;

    this.dispatchRunning = true;
    try {
      await this.lockService.withLock('email-dispatch', async () => {
        const batchSize = parseInt(
          process.env.EMAIL_WORKER_BATCH_SIZE || '10',
          10,
        );
        await this.dispatcher.dispatchAllPending(batchSize);
      });
    } catch (err: unknown) {
      this.logger.error(`Email dispatch cycle failed: ${err instanceof Error ? err.message : err}`);
      if (this.isTableMissingError(err)) {
        this.ready = false;
        this.logger.warn('Email worker disabled — table missing');
      }
    } finally {
      this.dispatchRunning = false;
    }
  }

  private isTableMissingError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('does not exist in the current database');
  }
}
