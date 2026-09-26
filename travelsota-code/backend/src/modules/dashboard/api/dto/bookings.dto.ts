import {
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsString,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BookingsQueryDto {
  @IsOptional()
  @IsIn(['all', 'flights', 'hotels'])
  type?: string = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsIn(['createdAt', 'amount', 'status'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: string = 'desc';
}

export class DeleteBookingParamDto {
  @IsIn(['flight', 'hotel'])
  type!: string;

  @IsUUID()
  id!: string;
}
