import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const VALID_PLATFORMS = [
  'twitter', 'instagram', 'linkedin', 'youtube',
  'facebook', 'tiktok', 'whatsapp', 'telegram',
] as const;

export type SocialPlatform = (typeof VALID_PLATFORMS)[number];

/**
 * Loose per-item shape — strict validation happens in the service so a single
 * malformed link (e.g. an incomplete row in the admin UI) is dropped instead
 * of failing the whole save (which would also block contact fields like WhatsApp).
 */
export class SocialLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}
