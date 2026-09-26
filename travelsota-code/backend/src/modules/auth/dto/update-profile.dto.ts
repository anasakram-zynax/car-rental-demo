import {
  IsString,
  IsOptional,
  IsDateString,
  Matches,
  MaxLength,
  Allow,
} from 'class-validator';

export class UpdateProfileDto {
  @Allow()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string | null;

  @Allow()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string | null;

  @Allow()
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format.' })
  phone?: string | null;

  @Allow()
  @IsDateString({}, { message: 'Invalid date format (YYYY-MM-DD).' })
  @IsOptional()
  dateOfBirth?: string | null;

  @Allow()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nationality?: string | null;

  @Allow()
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter ISO code.' })
  preferredCurrency?: string | null;

  @Allow()
  @IsString()
  @IsOptional()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, {
    message: 'Language must be a valid locale code (e.g. en, en-US).',
  })
  preferredLanguage?: string | null;
}
