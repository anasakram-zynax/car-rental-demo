import { Injectable, Logger } from '@nestjs/common';
import { isURL } from 'class-validator';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { UpdateSiteSettingsDto } from '../../api/dto';
import { VALID_PLATFORMS } from '../../api/dto/update-site-settings.dto';

@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger(SiteSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const row = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' },
    });
    if (!row) {
      return {
        siteName: null,
        tagline: null,
        phone: null,
        whatsapp: null,
        email: null,
        location: null,
        socialLinks: [],
      };
    }
    return {
      siteName: row.siteName,
      tagline: row.tagline,
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      location: row.location,
      socialLinks: this.parseSocialLinks(row.socialLinks),
    };
  }

  async upsertSettings(dto: UpdateSiteSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.siteName !== undefined) data.siteName = dto.siteName || null;
    if (dto.tagline !== undefined) data.tagline = dto.tagline || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.location !== undefined) data.location = dto.location || null;
    if (dto.socialLinks !== undefined) {
      data.socialLinks = dto.socialLinks.length > 0
        ? dto.socialLinks
            // Normalize first so the filter below deals with plain strings.
            .map((s, i) => ({
              platform: (s.platform ?? '').trim().toLowerCase(),
              url: (s.url ?? '').trim(),
              sortOrder: s.sortOrder ?? i,
            }))
            .filter((s) => {
              // Drop incomplete/invalid rows instead of rejecting the whole save
              // (a bad link must not block contact fields like WhatsApp).
              if (!s.platform || !(VALID_PLATFORMS as readonly string[]).includes(s.platform)) {
                this.logger.warn(`Dropping social link with invalid platform: ${JSON.stringify(s.platform)}`);
                return false;
              }
              if (!s.url || !isURL(s.url, { require_protocol: true })) {
                this.logger.warn(`Dropping social link with invalid url: ${JSON.stringify(s.url)}`);
                return false;
              }
              return true;
            })
        : [];
    }

    const row = await this.prisma.siteSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    this.logger.log('Site settings updated');
    return {
      siteName: row.siteName,
      tagline: row.tagline,
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      location: row.location,
      socialLinks: this.parseSocialLinks(row.socialLinks),
    };
  }

  private parseSocialLinks(raw: unknown): Array<{ platform: string; url: string }> {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s): s is { platform: string; url: string } =>
        typeof s === 'object' && s !== null &&
        typeof (s as any).platform === 'string' &&
        typeof (s as any).url === 'string' &&
        (s as any).url.length > 0,
    );
  }
}
