import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RefundService, type RefundEstimate, type CreditShellEntity } from './refund.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BusinessError } from '../../shared/errors/business-error';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────

class UseCreditShellDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsString() newBookingId: string;
  @IsOptional() @IsString() currency?: string;
}

class ShellQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsString() status?: string;
}

// ── Controller ────────────────────────────────────────────────────

@Controller('agent')
@UserTypes('agent')
export class AgentRefundController {
  constructor(
    private readonly refundService: RefundService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('bookings/:id/cancel/preview')
  @ResponseMessage('Cancellation estimate retrieved.')
  async getCancelPreview(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ): Promise<RefundEstimate> {
    // Verify ownership
    const booking = await this.findBooking(id, user.id);
    if (!booking) throw new NotFoundException('Booking not found');

    return this.refundService.getRefundEstimate(id);
  }

  @Get('credit-shells')
  @ResponseMessage('Credit shells retrieved.')
  async getCreditShells(
    @CurrentUser() user: { id: string },
    @Query() query: ShellQueryDto,
  ): Promise<{ items: CreditShellEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const profileId = await this.resolveProfileId(user.id);
    if (!profileId) return { items: [], total: 0, page: query.page ?? 1, limit: query.limit ?? 15, totalPages: 0 };

    return this.refundService.getAgentCreditShells(profileId, {
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  @Post('credit-shells/:id/use')
  @ResponseMessage('Credit shell applied.')
  async useCreditShell(
    @Param('id') id: string,
    @Body() dto: UseCreditShellDto,
    @CurrentUser() user: { id: string },
  ): Promise<CreditShellEntity> {
    const profileId = await this.resolveProfileId(user.id);
    if (!profileId) throw new NotFoundException('Agent profile not found');

    return this.refundService.useCreditShell(id, dto.amount, dto.newBookingId, profileId, dto.currency);
  }

  private async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  private async findBooking(bookingId: string, userId: string): Promise<boolean> {
    const [flight, hotel] = await Promise.all([
      this.prisma.flightBooking.findUnique({ where: { id: bookingId }, select: { userId: true } }),
      this.prisma.hotelBooking.findUnique({ where: { id: bookingId }, select: { userId: true } }),
    ]);
    return flight?.userId === userId || hotel?.userId === userId;
  }
}
