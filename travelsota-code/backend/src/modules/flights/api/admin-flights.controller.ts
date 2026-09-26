import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdminTravelportDiagnosticsService } from '../application/services/admin-travelport-diagnostics.service';
import { FlightBookingPublicService } from '../application/services/flight-booking-public.service';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { AdminRetryExtrasDto, AdminRefundExtrasDto } from './dto/admin-flights.dto';

@UserTypes('admin')
@Controller('admin/flights')
export class AdminFlightsController {
  constructor(
    private readonly diagnosticsService: AdminTravelportDiagnosticsService,
    private readonly flightBookingService: FlightBookingPublicService,
  ) {}

  // ── Booking detail ──

  @Get('bookings/:id/detail')
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Flight booking detail retrieved.')
  async getBookingDetail(@Param('id') bookingId: string) {
    return this.flightBookingService.adminFlightDetail(bookingId);
  }

  // ── Diagnostics ──

  @Get('diagnostics/travelport')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Travelport diagnostics completed.')
  async runTravelportDiagnostics() {
    return this.diagnosticsService.runDiagnostics();
  }

  // ── Extras Admin ──

  @Get('bookings/:id/extras')
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Booking extras retrieved.')
  async getBookingExtras(@Param('id') bookingId: string) {
    return this.diagnosticsService.getAdminExtras(bookingId);
  }

  @Post('bookings/:id/extras/retry')
  @RequirePermission(PermissionCode.BOOKINGS_WRITE)
  @ResponseMessage('Extras retry queued.')
  async retryFailedExtras(
    @Param('id') bookingId: string,
    @Body() body: AdminRetryExtrasDto,
  ) {
    return this.diagnosticsService.retryFailedExtras(bookingId, body.extraIds);
  }

  @Post('bookings/:id/extras/refund')
  @RequirePermission(PermissionCode.BOOKINGS_REFUND)
  @ResponseMessage('Extras refund processed.')
  async refundFailedExtras(
    @Param('id') bookingId: string,
    @Body() body: AdminRefundExtrasDto,
  ) {
    return this.diagnosticsService.refundFailedExtras(bookingId, body.extraIds, body.reason);
  }
}
