import { IsNumber, IsOptional, IsString, IsCurrency, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditNoteDto {
  @IsString()
  bookingId!: string;

  @IsString()
  originalInvoiceId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
