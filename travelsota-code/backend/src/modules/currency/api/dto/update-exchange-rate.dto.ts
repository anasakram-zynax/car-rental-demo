import { IsNumber, Min } from 'class-validator';

export class UpdateExchangeRateDto {
  @IsNumber()
  @Min(0.000001)
  rate!: number;
}
