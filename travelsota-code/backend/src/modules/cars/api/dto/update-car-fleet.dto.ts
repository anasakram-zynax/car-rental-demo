import { PartialType } from '@nestjs/mapped-types';
import { CreateCarFleetDto } from './create-car-fleet.dto';

export class UpdateCarFleetDto extends PartialType(CreateCarFleetDto) {}
