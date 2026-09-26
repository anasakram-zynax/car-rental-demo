import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';

/**
 * Resolves which users should receive a given notification type.
 *
 * Rules:
 * 1. Explicit role assignments from NotificationRuleRole.
 * 2. Staff users with required permissions based on category.
 * 3. Super admin / admin for critical platform events.
 * 4. Finance/admin roles for payment/refund/credit events.
 * 5. Booking/admin roles for booking events.
 */
@Injectable()
export class NotificationRecipientResolverService {
  private readonly logger = new Logger(NotificationRecipientResolverService.name);
  private readonly debug = process.env.ENABLE_NOTIFICATION_DEBUG === 'true';

  // Category → permission required for staff to receive
  private readonly CATEGORY_PERMISSION_MAP: Record<string, string[]> = {
    booking: [PermissionCode.BOOKINGS_READ],
    payment: [PermissionCode.BOOKINGS_READ],
    refund: [PermissionCode.BOOKINGS_REFUND],
    agent_credit: [PermissionCode.AGENTS_READ],
    wallet: [PermissionCode.AGENTS_READ, PermissionCode.USERS_READ],
    user: [PermissionCode.USERS_READ],
    role: [PermissionCode.USERS_MANAGE_ROLES],
    settings: [PermissionCode.SETTINGS_READ],
    provider: [PermissionCode.SETTINGS_READ],
  };

  constructor(private readonly prisma: PrismaService) {}

  async resolveRecipients(eventType: string, isCritical: boolean): Promise<string[]> {
    const userIds = new Set<string>();

    // 1. Get recipients from explicit NotificationRule → NotificationRuleRole assignments
    const rule = await this.prisma.notificationRule.findUnique({
      where: { type: eventType },
      include: {
        roles: {
          select: {
            roleId: true,
          },
        },
      },
    });

    // Independent recipient sources resolve in parallel — each only feeds
    // the shared id set (previously 4+ serial round trips per event).
    const lookups: Array<Promise<{ tag: string; ids: string[] }>> = [];

    if (rule?.enabled && rule.roles.length > 0) {
      const roleIds = rule.roles.map((r) => r.roleId);
      lookups.push(
        this.prisma.user
          .findMany({
            where: { roleId: { in: roleIds }, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          })
          .then((users) => ({ tag: 'rule-roles', ids: users.map((u) => u.id) })),
      );
    } else if (this.debug) {
      this.logger.log(
        `[NOTIF-DEBUG] STEP-5 no explicit rule roles for ${eventType} (rule=${rule?.id ?? 'null'}, enabled=${rule?.enabled ?? 'null'}, roles=${rule?.roles?.length ?? 0})`,
      );
    }

    // 2. Always include super_admins and admins for critical events
    if (isCritical) {
      lookups.push(
        (async () => {
          const adminRoles = await this.prisma.role.findMany({
            where: { name: { in: ['super_admin', 'admin'] } },
            select: { id: true },
          });
          const adminRoleIds = adminRoles.map((r) => r.id);
          if (adminRoleIds.length === 0) return { tag: 'critical-admins', ids: [] as string[] };
          const adminUsers = await this.prisma.user.findMany({
            where: { roleId: { in: adminRoleIds }, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          return { tag: 'critical-admins', ids: adminUsers.map((u) => u.id) };
        })(),
      );
    }

    // 3. Get recipients by category-based permissions
    const category = this.inferCategory(eventType);
    const requiredPermissions = this.CATEGORY_PERMISSION_MAP[category];

    if (requiredPermissions) {
      // Find all staff users who have at least one of the required permissions
      lookups.push(
        this.prisma.user
          .findMany({
            where: {
              userType: 'STAFF',
              status: 'ACTIVE',
              deletedAt: null,
              role: {
                permissions: {
                  some: {
                    permission: {
                      code: { in: requiredPermissions },
                    },
                  },
                },
              },
            },
            select: { id: true },
          })
          .then((staffUsers) => ({ tag: 'category-perms', ids: staffUsers.map((u) => u.id) })),
      );
    } else if (this.debug) {
      this.logger.log(
        `[NOTIF-DEBUG] STEP-5 no category perm mapping for category=${category}`,
      );
    }

    // 4. For payment/refund/credit/wallet events, also include finance-adjacent roles
    if (['payment', 'refund', 'agent_credit', 'wallet'].includes(category)) {
      lookups.push(
        this.prisma.user
          .findMany({
            where: {
              userType: 'STAFF',
              status: 'ACTIVE',
              deletedAt: null,
              role: { name: { in: ['super_admin', 'admin', 'manager'] } },
            },
            select: { id: true },
          })
          .then((financeUsers) => ({ tag: 'finance-roles', ids: financeUsers.map((u) => u.id) })),
      );
    }

    const settled = await Promise.all(lookups);
    for (const { tag, ids } of settled) {
      for (const id of ids) userIds.add(id);
      if (this.debug) {
        this.logger.log(`[NOTIF-DEBUG] STEP-5 ${tag}: +${ids.length} users`);
      }
    }

    const result = Array.from(userIds);

    // Fallback: if no recipients resolved, always include super_admin users
    // so the platform never silently swallows all notifications
    if (result.length === 0) {
      const fallbackRoles = await this.prisma.role.findMany({
        where: { name: 'super_admin' },
        select: { id: true },
      });
      const fallbackRoleIds = fallbackRoles.map((r) => r.id);
      if (fallbackRoleIds.length > 0) {
        const fallbackUsers = await this.prisma.user.findMany({
          where: {
            roleId: { in: fallbackRoleIds },
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: { id: true },
        });
        for (const u of fallbackUsers) result.push(u.id);
        if (this.debug) {
          this.logger.log(
            `[NOTIF-DEBUG] STEP-5 super_admin zero-recipients fallback: added ${fallbackUsers.length} super_admin users`,
          );
        }
      }
    }

    if (this.debug) {
      this.logger.log(
        `[NOTIF-DEBUG] STEP-5 FINAL: ${result.length} recipients for '${eventType}' (critical: ${isCritical}) → [${result.join(', ')}]`,
      );
    }
    return result;
  }

  private inferCategory(eventType: string): string {
    // Extract category from event type (e.g., "booking.flight.created" → "booking")
    const parts = eventType.split('.');
    if (parts[0] === 'booking') return 'booking';
    if (parts[0] === 'payment') return 'payment';
    if (parts[0] === 'refund') return 'refund';
    if (parts[0] === 'agent') return 'agent_credit';
    if (parts[0] === 'wallet') return 'wallet';
    if (parts[0] === 'user') return 'user';
    if (parts[0] === 'role') return 'role';
    if (parts[0] === 'settings') return 'settings';
    if (parts[0] === 'provider') return 'provider';
    return 'booking';
  }
}