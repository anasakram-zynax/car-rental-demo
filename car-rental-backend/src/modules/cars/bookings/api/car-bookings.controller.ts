import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateBookingUseCase } from '../application/use-cases/create-booking.use-case.js';
import { GetBookingUseCase } from '../application/use-cases/get-booking.use-case.js';
import { CreateCarBookingDto } from './dto/create-car-booking.dto.js';
import { CancelBookingUseCase } from '../application/use-cases/cancel-booking.use-case.js';
import { CancelCarBookingDto } from './dto/cancel-car-booking.dto.js';

@Controller('car-bookings')
export class CarBookingsController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
  ) {}

  @Post()
  create(@Body() dto: CreateCarBookingDto) {
    return this.createBooking.execute(dto);
  }

  @Get(':reference')
  get(@Param('reference') reference: string) {
    return this.getBooking.execute(reference);
  }

  @Patch(':reference/cancel')
  cancel(
    @Param('reference') reference: string,
    @Body() dto: CancelCarBookingDto,
  ) {
    return this.cancelBooking.execute(reference, dto.reason);
  }
}
