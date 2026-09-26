import { IsEmail, IsOptional, IsString, IsNumber, IsArray, Min, MinLength } from 'class-validator';

export class CreateSubAgentDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grantPermissions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revokePermissions?: string[];
}

export class UpdateSubAgentDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grantPermissions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revokePermissions?: string[];
}
