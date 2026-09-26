import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminBookingsService } from '../application/services/admin-bookings.service';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { BookingsQueryDto, DeleteBookingParamDto } from './dto/bookings.dto';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsArray } from 'class-validator';

class ChangeBookingDto {
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() holder?: { name?: string; surname?: string };
  @IsOptional() @IsBoolean() confirm?: boolean;
}

class BulkDeleteBookingsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsOptional() @IsIn(['flight', 'hotel', 'all']) type?: 'flight' | 'hotel' | 'all';
}

@UserTypes('admin')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(
    private readonly service: AdminBookingsService,
  ) {}

  @Get()
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Bookings list fetched.')
  getAll(@Query() query: BookingsQueryDto) {
    return this.service.getAll({
      type: query.type ?? 'all',
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      status: query.status,
      paymentStatus: query.paymentStatus,
      provider: query.provider,
      fromDate: query.fromDate,
      toDate: query.toDate,
      sortBy: query.sortBy ?? 'createdAt',
      sortDir: query.sortDir ?? 'desc',
    });
  }

  @Delete(':type/:id')
  @RequirePermission(PermissionCode.BOOKINGS_CANCEL)
  @ResponseMessage('Booking cancelled.')
  remove(@Param() params: DeleteBookingParamDto) {
    return this.service.remove(params.type, params.id);
  }

  @Post('bulk-delete')
  @RequirePermission(PermissionCode.BOOKINGS_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Bookings deleted.')
  deleteMany(@Body() dto: BulkDeleteBookingsDto) {
    return this.service.deleteMany(dto.type ?? 'all', dto.ids);
  }

  @Post(':id/sync-supplier')
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Supplier status synced.')
  syncSupplier(@Param('id') id: string) {
    return this.service.syncSupplier(id);
  }

  @Post(':id/change')
  @RequirePermission(PermissionCode.BOOKINGS_WRITE)
  @ResponseMessage('Booking change processed.')
  changeBooking(@Param('id') id: string, @Body() dto: ChangeBookingDto) {
    return this.service.changeBooking(id, {
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      holder: dto.holder,
      confirm: dto.confirm ?? false,
    });
  }

  @Get(':id/detail')
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Booking detail retrieved.')
  detail(@Param('id') id: string) {
    return this.service.adminBookingDetail(id);
  }
}
