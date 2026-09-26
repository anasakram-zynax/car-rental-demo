import { IsEmail, IsOptional, IsString } from 'class-validator';

export class InitiateVerificationDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;
}

export class SubmitLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
