import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../modules/access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../../modules/access-control/domain/enums/permission-code.enum';
import { NotificationService } from '../application/notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateNotificationRuleDto } from './dto/update-notification-rule.dto';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import type { NotificationListResult, UnreadCountResult, NotificationItem } from '../domain/notification-types';

@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  @Get()
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notifications listed.')
  async list(
    @CurrentUser() user: { id: string },
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationListResult> {
    return this.notificationService.list({
      userId: user.id,
      page: query.page,
      limit: query.limit,
      severity: query.severity,
      category: query.category,
      type: query.type,
      read: query.read,
      q: query.q,
      from: query.from,
      to: query.to,
    });
  }

  @Get('unread-count')
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Unread count retrieved.')
  async getUnreadCount(
    @CurrentUser() user: { id: string },
  ): Promise<UnreadCountResult> {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Get('critical')
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Critical notifications retrieved.')
  async getCritical(
    @CurrentUser() user: { id: string },
  ): Promise<NotificationItem[]> {
    return this.notificationService.getCriticalNotifications(user.id);
  }

  /**
   * Header bootstrap: unread count + critical + recent + high-severity feed
   * in ONE round trip. The admin header mounted these as 4 separate queries
   * on every tab — on slow links that fan-out alone cost seconds.
   */
  @Get('bootstrap')
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notification bootstrap retrieved.')
  async bootstrap(@CurrentUser() user: { id: string }): Promise<{
    unread: UnreadCountResult;
    critical: NotificationItem[];
    recent: NotificationListResult;
    high: NotificationListResult;
  }> {
    const [unread, critical, recent, high] = await Promise.all([
      this.notificationService.getUnreadCount(user.id),
      this.notificationService.getCriticalNotifications(user.id),
      this.notificationService.list({ userId: user.id, limit: 5, read: 'unread' }),
      this.notificationService.list({ userId: user.id, severity: 'high', read: 'unread', limit: 10 }),
    ]);
    return { unread, critical, recent, high };
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notifications marked as read.')
  async markRead(
    @CurrentUser() user: { id: string },
    @Body() body: MarkNotificationsReadDto,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.markRead(user.id, body.ids);
    // Sync the user's other connected clients/tabs (coalesced).
    this.notificationService.pushUnreadCount(user.id);
    return { count };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('All notifications marked as read.')
  async markAllRead(
    @CurrentUser() user: { id: string },
    @Query() query: NotificationQueryDto,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.markAllRead(user.id, {
      severity: query.severity,
      category: query.category,
      type: query.type,
    });
    // Sync the user's other connected clients/tabs (coalesced).
    this.notificationService.pushUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notification dismissed.')
  async dismiss(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<{ dismissed: boolean }> {
    const dismissed = await this.notificationService.dismiss(user.id, id);
    this.notificationService.pushUnreadCount(user.id);
    return { dismissed };
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_MANAGE)
  @ResponseMessage('Notifications deleted.')
  async deleteMany(
    @CurrentUser() user: { id: string },
    @Body() body: MarkNotificationsReadDto,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.deleteMany(user.id, body.ids);
    this.notificationService.pushUnreadCount(user.id);
    return { count };
  }

  @Get('preferences')
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notification preferences retrieved.')
  async getPreferences(@CurrentUser() user: { id: string }) {
    return this.notificationService.getPreferences(user.id);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_READ)
  @ResponseMessage('Notification preference updated.')
  async updatePreference(
    @CurrentUser() user: { id: string },
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    await this.notificationService.updatePreference(
      user.id,
      body.type,
      body.channel,
      body.enabled,
    );
    return { success: true };
  }

  @Get('rules')
  @RequirePermission(PermissionCode.NOTIFICATIONS_MANAGE)
  @ResponseMessage('Notification rules retrieved.')
  async getRules() {
    return this.notificationService.getRules();
  }

  @Patch('rules/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.NOTIFICATIONS_MANAGE)
  @ResponseMessage('Notification rule updated.')
  async updateRule(
    @Param('id') id: string,
    @Body() body: UpdateNotificationRuleDto,
  ) {
    return this.notificationService.updateRule(id, {
      enabled: body.enabled,
      severity: body.severity,
      critical: body.critical,
      roleIds: body.roleIds,
    });
  }
}
