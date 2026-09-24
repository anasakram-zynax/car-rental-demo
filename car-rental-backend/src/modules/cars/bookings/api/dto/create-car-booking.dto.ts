import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCarBookingDto {
  @IsUUID()
  carId!: string;

  @IsOptional()
  @IsUUID()
  transferPackageId?: string;

  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @Type(() => Date)
  @IsDate()
  pickupAt!: Date;

  @Type(() => Date)
  @IsOptional()
  @IsDate()
  returnAt?: Date;

  @IsString()
  driverFirstName!: string;

  @IsString()
  driverLastName!: string;

  @Type(() => Date)
  @IsOptional()
  @IsDate()
  driverBirthDate?: Date;

  @IsOptional()
  @IsString()
  driverLicenseNumber?: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  contactPhone!: string;

  @IsOptional()
  @IsString()
  specialRequests?: string;
}
