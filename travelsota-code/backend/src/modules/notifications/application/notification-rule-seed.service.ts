import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NOTIFICATION_EVENT_MAP } from '../domain/notification-types';

/**
 * Seeds NotificationRule rows from NOTIFICATION_EVENT_MAP on startup.
 * Each event type gets a default-enabled rule so the UI is never empty.
 */
@Injectable()
export class NotificationRuleSeedService implements OnModuleInit {
  private readonly logger = new Logger(NotificationRuleSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.RUN_NOTIFICATION_RULE_SEED === 'false') {
      this.logger.log('Notification rule seed disabled (RUN_NOTIFICATION_RULE_SEED=false)');
      return;
    }
    void this.seedRules();
  }

  private async seedRules() {
    try {
      const entries = Object.entries(NOTIFICATION_EVENT_MAP);
      let created = 0;

      for (const [eventType, mapping] of entries) {
        const existing = await this.prisma.notificationRule.findUnique({
          where: { type: eventType },
        });

        if (!existing) {
          await this.prisma.notificationRule.create({
            data: {
              type: eventType,
              category: mapping.category,
              severity: mapping.severity,
              enabled: true,
              critical: mapping.critical,
              description: `Auto-created rule for ${eventType}`,
            },
          });
          created++;
        }
      }

      this.logger.log(
        `Notification rule seed complete: ${created} created, ${entries.length - created} already existed`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Notification rule seed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
