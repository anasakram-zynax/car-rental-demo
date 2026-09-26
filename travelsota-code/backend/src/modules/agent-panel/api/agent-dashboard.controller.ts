import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { AgentAuthGuard } from './guards/agent-auth.guard';
import { sanitizeBookingReference } from '../../../shared/booking/booking-reference.util';

@Controller('agent/dashboard')
@UseGuards(AuthGuard('jwt'), AgentAuthGuard)
@UserTypes('agent')
export class AgentDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @ResponseMessage('Agent dashboard stats retrieved.')
  async getStats(@CurrentUser() user: { id: string }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [profile, flightTodayCount, hotelTodayCount, flights, hotels, pendingFlights, pendingHotels] = await Promise.all([
      this.prisma.agentProfile.findUnique({
        where: { userId: user.id },
        select: {
          walletBalance: true,
          creditLimit: true,
          creditUsed: true,
          commissionRate: true,
          isApproved: true,
          kycStatus: true,
        },
      }),
      this.prisma.flightBooking.count({
        where: { userId: user.id, createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.hotelBooking.count({
        where: { userId: user.id, createdAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.flightBooking.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, amount: true, currency: true, locatorCode: true, createdAt: true },
      }),
      this.prisma.hotelBooking.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, amount: true, currency: true, clientReference: true, createdAt: true },
      }),
      this.prisma.flightBooking.count({
        where: { userId: user.id, status: { in: ['pending_payment', 'booking_in_progress', 'held'] } },
      }),
      this.prisma.hotelBooking.count({
        where: { userId: user.id, status: { in: ['pending_payment', 'booking_in_progress'] } },
      }),
    ]);

    const allBookings = [
      ...flights.map((b) => ({ id: b.id, type: 'flight' as const, status: b.status, amount: b.amount, currency: b.currency, ref: b.locatorCode, createdAt: b.createdAt })),
      ...hotels.map((b) => ({ id: b.id, type: 'hotel' as const, status: b.status, amount: b.amount, currency: b.currency, ref: sanitizeBookingReference(b.clientReference), createdAt: b.createdAt })),
    ];
    const recentBookings = allBookings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);

    return {
      walletBalance: Number(profile?.walletBalance ?? 0),
      creditLimit: Number(profile?.creditLimit ?? 0),
      creditUsed: Number(profile?.creditUsed ?? 0),
      commissionRate: Number(profile?.commissionRate ?? 0),
      kycStatus: profile?.kycStatus ?? 'PENDING',
      isApproved: profile?.isApproved ?? false,
      stats: {
        todaysBookings: flightTodayCount + hotelTodayCount,
        pendingBookings: pendingFlights + pendingHotels,
        walletBalance: Number(profile?.walletBalance ?? 0),
        creditAvailable: Number(profile?.creditLimit ?? 0) - Number(profile?.creditUsed ?? 0),
      },
      recentBookings,
    };
  }
}
