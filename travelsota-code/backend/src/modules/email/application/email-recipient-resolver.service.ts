import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { EmailRecipientInfo } from '../domain/email-event-types';

@Injectable()
export class EmailRecipientResolver {
  private readonly logger = new Logger(EmailRecipientResolver.name);

  /** Seed/demo-only accounts must never become admin-notification recipients. */
  private static readonly DEMO_ONLY_EMAILS = [
    'admin@travelsota.com',
    'agent@travelsota.com',
    'customer@travelsota.com',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async resolveCustomer(bookingId: string): Promise<EmailRecipientInfo[]> {
    const flight = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    }).catch(() => null);

    if (flight?.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: flight.userId },
        select: { email: true, id: true },
      }).catch(() => null);
      if (user?.email) {
        return [{ email: user.email, recipientType: 'customer', userId: user.id }];
      }
    }

    const hotel = await this.prisma.hotelBooking.findUnique({
      where: { id: bookingId },
      select: { userId: true, holder: true },
    }).catch(() => null);

    if (hotel?.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: hotel.userId },
        select: { email: true, id: true },
      }).catch(() => null);
      if (user?.email) {
        return [{ email: user.email, recipientType: 'customer', userId: user.id }];
      }
    }

    if (hotel?.holder) {
      const holder = hotel.holder as Record<string, unknown>;
      const email = (holder.email ?? holder.guestEmail) as string | undefined;
      if (email) {
        return [{ email, recipientType: 'customer' }];
      }
    }

    return [];
  }

  async resolveAgent(bookingId: string): Promise<EmailRecipientInfo[]> {
    const flight = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    }).catch(() => null);

    let agentProfileId: string | undefined;

    if (flight?.userId) {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { userId: flight.userId },
        select: { id: true, userId: true },
      }).catch(() => null);
      if (agent) agentProfileId = agent.id;
    }

    if (!agentProfileId) {
      const hotel = await this.prisma.hotelBooking.findUnique({
        where: { id: bookingId },
        select: { userId: true },
      }).catch(() => null);

      if (hotel?.userId) {
        const agent = await this.prisma.agentProfile.findUnique({
          where: { userId: hotel.userId },
          select: { id: true, userId: true },
        }).catch(() => null);
        if (agent) agentProfileId = agent.id;
      }
    }

    if (!agentProfileId) return [];

    const agentProfile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { userId: true },
    }).catch(() => null);

    if (!agentProfile?.userId) return [];

    const user = await this.prisma.user.findUnique({
      where: { id: agentProfile.userId },
      select: { email: true, id: true },
    }).catch(() => null);

    if (user?.email) {
      return [{ email: user.email, recipientType: 'agent', userId: user.id }];
    }

    return [];
  }

  async resolveAdmins(roleIds?: string[]): Promise<EmailRecipientInfo[]> {
    const recipients: EmailRecipientInfo[] = [];

    // Explicit env override wins. NOTE: the variable name is exactly ADMIN_EMAIL —
    // other names (NOTIFICATION_EMAIL, SMTP_FROM, ...) are NOT read.
    const defaultAdminEmail = process.env.ADMIN_EMAIL;
    if (defaultAdminEmail) {
      recipients.push({ email: defaultAdminEmail, recipientType: 'admin' });
    }

    if (roleIds && roleIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          roleId: { in: roleIds },
          email: { not: '', notIn: EmailRecipientResolver.DEMO_ONLY_EMAILS },
        },
        select: { email: true, id: true },
      }).catch(() => []);

      for (const user of users) {
        if (user.email && !recipients.some((r) => r.email === user.email)) {
          recipients.push({ email: user.email, recipientType: 'admin', userId: user.id });
        }
      }
    }

    if (recipients.length === 0 && !defaultAdminEmail) {
      const fallbackAdmin = await this.prisma.user.findFirst({
        where: {
          userType: 'STAFF',
          email: { not: '', notIn: EmailRecipientResolver.DEMO_ONLY_EMAILS },
        },
        select: { email: true, id: true },
      }).catch(() => null);

      if (fallbackAdmin?.email) {
        recipients.push({ email: fallbackAdmin.email, recipientType: 'admin', userId: fallbackAdmin.id });
      }
    }

    if (recipients.length === 0) {
      this.logger.warn(
        `No admin email recipients resolved. Set ADMIN_EMAIL in env to receive booking notifications.`,
      );
    }

    return recipients;
  }

  async resolveByRule(type: string, aggregateId?: string): Promise<EmailRecipientInfo[]> {
    const rule = await this.prisma.emailRule.findUnique({
      where: { type },
    });

    if (!rule?.enabled) return [];

    const recipients: EmailRecipientInfo[] = [];

    if (rule.sendToCustomer && aggregateId) {
      const customer = await this.resolveCustomer(aggregateId);
      recipients.push(...customer);
    }

    if (rule.sendToAgent && aggregateId) {
      const agent = await this.resolveAgent(aggregateId);
      recipients.push(...agent);
    }

    if (rule.sendToAdmin) {
      const roleIds = rule.sendToRoles.length > 0 ? rule.sendToRoles : undefined;
      const admins = await this.resolveAdmins(roleIds);
      recipients.push(...admins);
    }

    return recipients;
  }
}
