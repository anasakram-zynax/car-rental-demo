import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CarsService } from '../application/services/cars.service';
import { CreateCarFleetDto } from './dto/create-car-fleet.dto';
import { UpdateCarFleetDto } from './dto/update-car-fleet.dto';

@UserTypes('admin')
@UseGuards(AuthGuard('jwt'))
@Controller('admin/cars/fleet')
export class CarsAdminController {
  constructor(private readonly carsService: CarsService) {}

  @Post()
  @ResponseMessage('Car fleet created.')
  create(@Body() dto: CreateCarFleetDto) {
    return this.carsService.create(dto);
  }

  @Get()
  @ResponseMessage('Car fleet list.')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.carsService.list(
      page ? Number.parseInt(page, 10) : 1,
      pageSize ? Number.parseInt(pageSize, 10) : 20,
      search,
    );
  }

  @Get(':id')
  @ResponseMessage('Car fleet details.')
  getById(@Param('id') id: string) {
    return this.carsService.getById(id);
  }

  @Patch(':id')
  @ResponseMessage('Car fleet updated.')
  update(@Param('id') id: string, @Body() dto: UpdateCarFleetDto) {
    return this.carsService.update(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Car fleet deactivated.')
  deactivate(@Param('id') id: string) {
    return this.carsService.deactivate(id);
  }
}
