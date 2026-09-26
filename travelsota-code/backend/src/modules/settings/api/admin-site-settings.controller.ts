import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { SiteSettingStore } from '../infrastructure/site-setting.store';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';

const HERO_MODULE_KEYS = new Set(['flights', 'hotels']);

/** Light validation: { flights?: string|null, hotels?: string|null } — URL strings only. */
function sanitizeHeroBackgrounds(
  value: unknown,
): Record<string, string> | null {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!HERO_MODULE_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.startsWith('http')) out[k] = v;
    else if (v === null) continue;
    else return null;
  }
  return out;
}

const BRANDING_KEYS = new Set(['logo', 'favicon']);

/** { logo?: url, favicon?: url } — URL strings only, unknown keys dropped. */
function sanitizeBranding(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!BRANDING_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.startsWith('http')) out[k] = v;
    else if (v === null) continue;
    else return null;
  }
  return out;
}

/** Strict boolean (accepts true/false only). */
function sanitizeBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Clamped positive integer minutes (15 min … 30 days). */
function sanitizeWindowMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 15 || value > 43200) return null;
  return value;
}

/** Truncated non-empty string or null. */
function sanitizeText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

@UserTypes('admin')
@Controller('admin/settings/general')
export class AdminSiteSettingsController {
  constructor(private readonly store: SiteSettingStore) {}

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  async getAll() {
    return {
      guestBookingEnabled:
        (await this.store.get<boolean>('guestBookingEnabled')) ?? true,
      showPriceBreakdown:
        (await this.store.get<boolean>('showPriceBreakdown')) ?? false,
      heroBackgrounds:
        (await this.store.get<Record<string, string>>('heroBackgrounds')) ?? {},
      branding:
        (await this.store.get<Record<string, string>>('branding')) ?? {},
      siteTitle: (await this.store.get<string | null>('siteTitle')) ?? null,
      siteDescription:
        (await this.store.get<string | null>('siteDescription')) ?? null,
      // Booking workflow: false = admin must issue held bookings manually.
      bookingCustomerConfirm:
        (await this.store.get<boolean>('bookingCustomerConfirm')) ?? true,
      // Pay-later / bank-transfer hold window in minutes (admin-set expiry).
      payLaterWindowMinutes:
        (await this.store.get<number>('payLaterWindowMinutes')) ?? 60,
    };
  }

  @Patch()
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_SITE)
  @ResponseMessage('Settings updated.')
  async update(@Body() body: { key: string; value: unknown }) {
    const allowed = new Set([
      'guestBookingEnabled',
      'showPriceBreakdown',
      'heroBackgrounds',
      'branding',
      'siteTitle',
      'siteDescription',
      'bookingCustomerConfirm',
      'payLaterWindowMinutes',
    ]);
    if (!allowed.has(body.key)) {
      return { error: `Unknown setting: ${body.key}` };
    }
    let value = body.value;
    if (body.key === 'heroBackgrounds') {
      const sanitized = sanitizeHeroBackgrounds(value);
      if (sanitized === null) {
        return {
          error:
            'heroBackgrounds must be an object of { flights?: url, hotels?: url }',
        };
      }
      value = sanitized;
    } else if (body.key === 'branding') {
      const sanitized = sanitizeBranding(value);
      if (sanitized === null) {
        return {
          error: 'branding must be an object of { logo?: url, favicon?: url }',
        };
      }
      value = sanitized;
    } else if (body.key === 'siteTitle') {
      const sanitized = sanitizeText(value, 120);
      if (
        sanitized === null &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        return { error: 'siteTitle must be a non-empty string.' };
      }
      value = sanitized;
    } else if (body.key === 'siteDescription') {
      const sanitized = sanitizeText(value, 300);
      if (
        sanitized === null &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        return { error: 'siteDescription must be a non-empty string.' };
      }
      value = sanitized;
    } else if (body.key === 'bookingCustomerConfirm') {
      const sanitized = sanitizeBool(value);
      if (sanitized === null) {
        return { error: 'bookingCustomerConfirm must be true or false.' };
      }
      value = sanitized;
    } else if (body.key === 'payLaterWindowMinutes') {
      const sanitized = sanitizeWindowMinutes(value);
      if (sanitized === null) {
        return {
          error:
            'payLaterWindowMinutes must be an integer between 15 and 43200.',
        };
      }
      value = sanitized;
    }
    await this.store.set(body.key, value);
    return { success: true, key: body.key, value };
  }
}
