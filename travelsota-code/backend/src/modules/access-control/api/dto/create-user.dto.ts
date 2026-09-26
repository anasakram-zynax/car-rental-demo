import { IsString, IsOptional, IsEmail, IsIn, MinLength } from 'class-validator';
import type { UserType } from '../../domain/user.entity';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsIn(['STAFF', 'CUSTOMER', 'AGENT']) userType?: UserType;
}
