import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ListBookingsUseCase } from '../application/use-cases/list-bookings.use-case.js';
import { GetBookingUseCase } from '../application/use-cases/get-booking.use-case.js';
import { UpdatePaymentStatusUseCase } from '../application/use-cases/update-payment-status.use-case.js';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto.js';

@Controller('admin/car-bookings')
export class AdminCarBookingsController {
  constructor(
    private readonly listBookings: ListBookingsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly updatePaymentStatus: UpdatePaymentStatusUseCase,
  ) {}

  @Get()
  list() {
    return this.listBookings.execute();
  }

  @Get(':reference')
  get(@Param('reference') reference: string) {
    return this.getBooking.execute(reference);
  }

  @Patch(':reference/payment-status')
  updatePayment(
    @Param('reference') reference: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.updatePaymentStatus.execute(reference, dto.paymentStatus);
  }
}
