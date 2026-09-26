import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { SiteSettingStore } from '../infrastructure/site-setting.store';
import { ProviderConfigService } from '../application/services/provider-config.service';
import { COUNTRIES } from '../reference-data/countries';
import { PublicCacheInterceptor } from '../../../shared/cache/public-cache.interceptor';

/**
 * Public endpoint — no auth required.
 * Returns whether guest booking is currently enabled so the frontend
 * can gate the checkout UI without making an authenticated call.
 */
@UserTypes('public')
@Controller('settings')
@UseInterceptors(PublicCacheInterceptor)
export class PublicSiteSettingsController {
  constructor(
    private readonly store: SiteSettingStore,
    private readonly providerConfig: ProviderConfigService,
  ) {}

  @Get('guest-booking')
  async getGuestBookingStatus() {
    const enabled =
      (await this.store.get<boolean>('guestBookingEnabled')) ?? true;
    return { enabled };
  }

  /**
   * Site-wide meta (title + description) for the root <title>/description.
   * null = frontend falls back to its bundled defaults. Public — plain text.
   */
  @Get('site-meta')
  async getSiteMeta() {
    return {
      siteTitle: (await this.store.get<string | null>('siteTitle')) ?? null,
      siteDescription:
        (await this.store.get<string | null>('siteDescription')) ?? null,
    };
  }

  /**
   * Admin-curated brand assets (site logo + favicon URL) for public surfaces.
   * Empty object = consumers fall back to bundled defaults. Public — URLs only.
   */
  @Get('branding')
  async getSiteBranding() {
    const branding =
      (await this.store.get<Record<string, string>>('branding')) ?? {};
    return { branding };
  }

  /**
   * Admin-curated hero background images per search module. Empty object =
   * frontend falls back to the bundled defaults. Public — URLs only.
   */
  @Get('hero-backgrounds')
  async getHeroBackgrounds() {
    const backgrounds =
      (await this.store.get<Record<string, string>>('heroBackgrounds')) ?? {};
    return { backgrounds };
  }

  /**
   * All site-wide branding in ONE call: logo, favicon, per-module hero images,
   * and the title/description. The frontend fetches this once instead of three
   * endpoints — fewer round-trips, faster hydration.
   * null/empty fields = consumer falls back to bundled defaults.
   */
  @Get('site-config')
  async getSiteConfig() {
    const [branding, backgrounds, siteTitle, siteDescription] = await Promise.all([
      this.store.get<Record<string, string>>('branding'),
      this.store.get<Record<string, string>>('heroBackgrounds'),
      this.store.get<string | null>('siteTitle'),
      this.store.get<string | null>('siteDescription'),
    ]);
    return {
      logo: branding?.logo ?? null,
      favicon: branding?.favicon ?? null,
      hero: {
        flights: backgrounds?.flights ?? null,
        hotels: backgrounds?.hotels ?? null,
      },
      siteTitle: siteTitle ?? null,
      siteDescription: siteDescription ?? null,
    };
  }

  /**
   * Whether the admin price-breakdown toggle is ON.
   * When true, admins/agents see supplier amount + markup on offers.
   * When false, only the final price is shown (same view for everyone).
   */
  @Get('price-breakdown')
  async getPriceBreakdownSetting() {
    const showPriceBreakdown =
      (await this.store.get<boolean>('showPriceBreakdown')) ?? false;
    return { showPriceBreakdown };
  }

  /**
   * Full list of countries (ISO2 code, name, dial code) for the phone
   * country-code and nationality dropdowns on the booking pages.
   */
  @Get('countries')
  getCountries() {
    return { countries: COUNTRIES };
  }

  /**
   * Module visibility + display names for the public site. A module is
   * enabled when at least one of its suppliers is on. The frontend hides
   * the module's navigation + search form when disabled, and uses the
   * custom name (e.g. "Hotels" → "Stays").
   */
  @Get('modules')
  getModules() {
    return this.providerConfig.getPublicModules();
  }
}
