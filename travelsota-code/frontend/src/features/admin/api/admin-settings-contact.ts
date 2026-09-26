import { adminRequest } from '@/lib/api/admin-client';

export interface SocialLink {
  platform: string;
  url: string;
  sortOrder?: number;
}

export interface SiteSettings {
  siteName: string | null;
  tagline: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  location: string | null;
  socialLinks: SocialLink[];
}

export interface UpdateSiteSettingsInput {
  siteName?: string;
  tagline?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  location?: string;
  socialLinks?: SocialLink[];
}

export function getSiteSettings() {
  return adminRequest<SiteSettings>('/admin/site-settings');
}

export function updateSiteSettings(data: UpdateSiteSettingsInput) {
  return adminRequest<SiteSettings>('/admin/site-settings', {
    method: 'PUT',
    body: data,
  });
}

export function getPublicSiteSettings() {
  return adminRequest<SiteSettings>('/site-settings');
}
