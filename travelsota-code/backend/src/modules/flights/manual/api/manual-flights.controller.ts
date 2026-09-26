import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { ManualFlightsService } from '../application/services/manual-flights.service';
import { CreateManualFlightDto } from './dto/create-manual-flight.dto';
import { UpdateManualFlightDto } from './dto/update-manual-flight.dto';

@UserTypes('admin')
@Controller('admin/flights/manual')
export class ManualFlightsController {
  constructor(private readonly service: ManualFlightsService) {}

  @Get()
  @ResponseMessage('Manual flights list.')
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      search,
    );
  }

  @Get(':id')
  @ResponseMessage('Manual flight details.')
  async get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ResponseMessage('Manual flight created.')
  async create(@Body() dto: CreateManualFlightDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ResponseMessage('Manual flight updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateManualFlightDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Manual flight deleted.')
  async remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Get('airports/search')
  @ResponseMessage('Airport search.')
  async searchAirports(@Query('q') q: string) {
    return this.service.searchAirports(q ?? '');
  }

  @Get('airlines/search')
  @ResponseMessage('Airline search.')
  async searchAirlines(@Query('q') q: string) {
    return this.service.searchAirlines(q ?? '');
  }
}
