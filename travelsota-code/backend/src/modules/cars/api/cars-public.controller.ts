import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CarsService } from '../application/services/cars.service';
import { CarCheckoutService } from '../application/services/car-checkout.service';
import { CarSearchDto } from './dto/car-search.dto';
import {
  CarLocationSuggestionsDto,
  CarTransferDropoffsDto,
} from './dto/car-location-query.dto';
import { CarRentalCheckoutDto } from './dto/car-checkout.dto';
import { CancelCarBookingDto } from './dto/cancel-car-booking.dto';
import { CarCancellationService } from '../application/services/car-cancellation.service';

@Controller('cars')
export class CarsPublicController {
  constructor(
    private readonly carsService: CarsService,
    private readonly checkoutService: CarCheckoutService,
    private readonly cancellationService: CarCancellationService,
  ) {}

  @Get('search')
  @ResponseMessage('Cars search results.')
  search(@Query() query: CarSearchDto) {
    return this.carsService.search(query);
  }

  @Get('locations/suggestions')
  @ResponseMessage('Cars location suggestions.')
  suggestLocations(@Query() query: CarLocationSuggestionsDto) {
    return this.carsService.suggestLocations(
      query.serviceType,
      query.q,
      query.limit,
    );
  }

  @Get('transfers/dropoffs')
  @ResponseMessage('Cars transfer drop-off locations.')
  transferDropoffs(@Query() query: CarTransferDropoffsDto) {
    return this.carsService.findTransferDropoffs(
      query.pickupLocationId,
      query.q,
    );
  }

  @Post('bookings/checkout')
  @UseGuards(AuthGuard('jwt'))
  @UserTypes('customer')
  @ResponseMessage('Cars checkout initiated — proceed to payment.')
  checkout(
    @Body() input: CarRentalCheckoutDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.checkoutService.checkout(input, user.id);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(AuthGuard('jwt'))
  @UserTypes('customer')
  @ResponseMessage('Cars booking cancelled.')
  cancelBooking(
    @Param('id') id: string,
    @Body() input: CancelCarBookingDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.cancellationService.cancelOwnBooking(id, user.id, input.reason);
  }
}
