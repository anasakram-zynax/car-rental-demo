import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { ManualHotelsService } from '../application/services/manual-hotels.service';
import { CreateManualHotelDto } from './dto/create-manual-hotel.dto';
import { UpdateManualHotelDto } from './dto/update-manual-hotel.dto';
import { UpdateManualHotelRoomDto } from './dto/update-manual-hotel-room.dto';

@UserTypes('admin')
@Controller('admin/hotels/manual')
export class ManualHotelsController {
  constructor(private readonly service: ManualHotelsService) {}

  @Get()
  @ResponseMessage('Manual hotels list.')
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
  @ResponseMessage('Manual hotel details.')
  async get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ResponseMessage('Manual hotel created.')
  async create(@Body() dto: CreateManualHotelDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ResponseMessage('Manual hotel updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateManualHotelDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Manual hotel deleted.')
  async remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Post(':id/rooms')
  @ResponseMessage('Room added to manual hotel.')
  async addRoom(@Param('id') hotelId: string, @Body() dto: any) {
    return this.service.addRoom(hotelId, dto);
  }

  @Patch(':hotelId/rooms/:roomId')
  @ResponseMessage('Room updated.')
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateManualHotelRoomDto,
  ) {
    return this.service.updateRoom(roomId, dto);
  }

  @Delete(':hotelId/rooms/:roomId')
  @ResponseMessage('Room deleted.')
  async removeRoom(@Param('roomId') roomId: string) {
    return this.service.softDeleteRoom(roomId);
  }
}
