import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, MinLength, IsInt, Min } from 'class-validator';

export class UpdateManualFlightDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() airlineId?: string;
  @IsOptional() @IsString() airlineName?: string;
  @IsOptional() @IsString() flightNumber?: string;
  @IsOptional() @IsString() originId?: string;
  @IsOptional() @IsString() originCity?: string;
  @IsOptional() @IsString() destinationId?: string;
  @IsOptional() @IsString() destinationCity?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsString() departureTime?: string;
  @IsOptional() @IsDateString() arrivalDate?: string;
  @IsOptional() @IsString() arrivalTime?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) flightOrder?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) basePrice?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Type(() => Number) childPricePercent?: number;
  @IsOptional() @IsNumber() @Type(() => Number) infantPricePercent?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) availableSeats?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) totalSeats?: number;
  @IsOptional() @IsBoolean() refundable?: boolean;
  @IsOptional() @IsString() cabinClass?: string;
  @IsOptional() @IsBoolean() hasWifi?: boolean;
  @IsOptional() @IsBoolean() hasMeal?: boolean;
  @IsOptional() @IsBoolean() hasEntertainment?: boolean;
  @IsOptional() @IsBoolean() hasPowerOutlet?: boolean;
  @IsOptional() @IsString() checkedBaggage?: string;
  @IsOptional() @IsString() cabinBaggage?: string;
}
