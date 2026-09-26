import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';

export class ListEmailsDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

export class UpdateEmailRuleDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  sendToCustomer?: boolean;

  @IsBoolean()
  @IsOptional()
  sendToAdmin?: boolean;

  @IsBoolean()
  @IsOptional()
  sendToAgent?: boolean;
}

export class TestEmailDto {
  @IsString()
  email!: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  message?: string;
}
