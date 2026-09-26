import { IsString, MinLength } from 'class-validator';

export class VoidInvoiceDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
