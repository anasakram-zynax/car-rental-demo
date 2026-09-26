import { IsOptional, IsString, IsArray } from 'class-validator';

export class AdminDiagnosticTestDto {
  @IsString()
  @IsOptional()
  endpoint?: string;

  @IsString()
  @IsOptional()
  method?: 'GET' | 'POST' | 'PUT';
}

export class AdminRetryExtrasDto {
  @IsArray()
  @IsString({ each: true })
  extraIds: string[];
}

export class AdminRefundExtrasDto {
  @IsArray()
  @IsString({ each: true })
  extraIds: string[];

  @IsString()
  @IsOptional()
  reason?: string;
}
