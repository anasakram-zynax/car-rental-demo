import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminBookingService, type AgentBookingFeedFilters, type PaginatedAgentBookingFeed, type BookingFinancialSummary } from './admin-booking.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsString, IsOptional, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────
class AdminCancelBookingDto {
  @IsOptional() @IsString() reason?: string;
}

class AdminBookingFeedQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @IsIn(['flight', 'hotel']) type?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() agentId?: string;
}

// ── Controller ────────────────────────────────────────────────────

@Controller('admin')
@UserTypes('admin')
export class AdminBookingController {
  constructor(
    private readonly adminBookingService: AdminBookingService,
  ) {}

  /**
   * Real-time feed of all agent bookings (flight + hotel).
   * Supports date range, status, type, text search, and agent filters.
   */
  @Get('agent-bookings')
  @ResponseMessage('Agent bookings feed retrieved.')
  async getAgentBookingFeed(
    @Query() query: AdminBookingFeedQueryDto,
  ): Promise<PaginatedAgentBookingFeed> {
    return this.adminBookingService.getAgentBookingFeed(query);
  }

  /**
   * Financial summary for a specific booking.
   * Includes wallet transactions, commissions, modifications, and credit shells.
   */
  @Get('agent-bookings/:id/financial-summary')
  @ResponseMessage('Booking financial summary retrieved.')
  async getBookingFinancialSummary(
    @Param('id') id: string,
  ): Promise<BookingFinancialSummary | { message: string }> {
    const summary = await this.adminBookingService.getBookingFinancialSummary(id);
    if (!summary) return { message: 'Booking not found' };
    return summary;
  }

  /**
   * Admin cancels a booking (any agent's booking).
   */
  @Post('bookings/:id/cancel')
  @ResponseMessage('Booking cancelled by admin.')
  async adminCancelBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AdminCancelBookingDto,
  ): Promise<any> {
    return this.adminBookingService.adminCancelBooking(id, user.id, dto.reason);
  }

  /**
   * Admin issues a held/pending flight booking (manual issue for
   * bank-transfer / pay-later / toggle-OFF bookings).
   */
  @Post('bookings/:id/issue')
  @ResponseMessage('Booking issued by admin.')
  async adminIssueBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<any> {
    return this.adminBookingService.adminIssueBooking(id, user.id);
  }

  /**
   * Cancellation fee estimate WITHOUT cancelling.
   * Shows supplier policy fee + net refund before admin confirms.
   */
  @Get('bookings/:id/cancel-estimate')
  @ResponseMessage('Cancellation estimate retrieved.')
  async getCancelEstimate(@Param('id') id: string): Promise<any> {
    return this.adminBookingService.getCancelEstimate(id);
  }
}
