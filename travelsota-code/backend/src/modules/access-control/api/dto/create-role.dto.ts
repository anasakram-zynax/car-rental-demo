import { IsString, IsOptional, IsBoolean, IsArray, IsInt } from 'class-validator';

export class CreateRoleDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isProtected?: boolean;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[];
}
