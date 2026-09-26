import { IsOptional, IsIn, IsInt, Min } from 'class-validator';

export class RevenueQueryDto {
  @IsOptional()
  @IsIn(['30d', 'quarterly', 'annually'])
  range?: '30d' | 'quarterly' | 'annually' = '30d';
}

export class RecentActivityQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 15;
}

export class TrendPeriodQueryDto {
  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'annually'])
  period?: 'monthly' | 'quarterly' | 'annually' = 'monthly';
}
