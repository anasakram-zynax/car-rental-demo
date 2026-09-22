import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCarBookingDto {
  @IsUUID()
  carId!: string;

  @IsString()
  pickupLocation!: string;

  @IsString()
  dropoffLocation!: string;

  @Type(() => Date)
  @IsDate()
  pickupAt!: Date;

  @Type(() => Date)
  @IsDate()
  returnAt!: Date;

  @IsString()
  driverFirstName!: string;

  @IsString()
  driverLastName!: string;

  @Type(() => Date)
  @IsDate()
  driverBirthDate!: Date;

  @IsString()
  driverLicenseNumber!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  contactPhone!: string;

  @IsOptional()
  @IsString()
  specialRequests?: string;
}
