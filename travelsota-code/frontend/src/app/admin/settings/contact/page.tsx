'use client';

import { Suspense, useState, useCallback } from 'react';
import { Globe, Plus, Trash2, CheckCircle2, Share2, GripVertical } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import type { SocialLink as SocialLinkType, SiteSettings } from '@/features/admin/api/admin-settings-contact';
import { useSiteSettings, useUpdateSiteSettings } from '@/features/admin/hooks/use-site-settings';
import { SOCIAL_ICON_MAP } from '@/components/common/SocialIcons';

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
];

function statCard(label: string, value: number | string, detail: string, tone: string, Icon: React.ComponentType<{ className?: string }>) {
  return (
    <div className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-[0_1px_3px_-1px_hsl(var(--foreground)/0.06)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_8px_20px_-14px_hsl(var(--foreground)/0.18)]">
      <span style={{ backgroundColor: tone }} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"><Icon className="size-3.5" /></span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <p className="text-lg font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
          <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'h-9 text-sm';

/** Trim + prepend https:// so the backend's strict URL validation passes. */
function normalizeSocialUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `https://${url}`;
}

function ContactSettingsEditor({ settings, canEdit, isSaving, onSave }: {
  settings: SiteSettings;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (data: { siteName?: string; tagline?: string; phone?: string; whatsapp?: string; email?: string; location?: string; socialLinks: SocialLinkType[] }) => void;
}) {
  const [socialLinks, setSocialLinks] = useState<SocialLinkType[]>(settings.socialLinks ?? []);

  const activeSocialLinks = socialLinks.filter((s) => s.url.trim().length > 0 && s.platform).length;
  const contactFieldsFilled = [settings.siteName, settings.phone, settings.whatsapp, settings.email, settings.location].filter(Boolean).length;

  const handleSave = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    onSave({
      siteName: (fd.get('siteName') as string) || undefined,
      tagline: (fd.get('tagline') as string) || undefined,
      phone: (fd.get('phone') as string) || undefined,
      whatsapp: (fd.get('whatsapp') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      location: (fd.get('location') as string) || undefined,
      // Only send complete rows (platform + URL) and normalize URLs so the
      // backend's strict validation never rejects the whole payload.
      socialLinks: socialLinks
        .map((s) => ({ platform: s.platform.trim(), url: normalizeSocialUrl(s.url) }))
        .filter((s) => s.platform && s.url),
    });
  }, [canEdit, socialLinks, onSave]);

  const addSocialLink = useCallback(() => {
    setSocialLinks((prev) => [...prev, { platform: '', url: '' }]);
  }, []);

  const removeSocialLink = useCallback((index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateSocialLink = useCallback((index: number, field: 'platform' | 'url', value: string) => {
    setSocialLinks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  return (
    <form className="space-y-5" onSubmit={handleSave}>
      <AdminPageHeader
        title="Contact & Social"
        description="Manage contact information, social media links, and site branding displayed in the public footer."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Contact & Social' }]}
      />

      <section aria-label="Overview" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {statCard('Social Links', activeSocialLinks, 'active', 'hsl(var(--chart-2))', Share2)}
        {statCard('Profile', `${contactFieldsFilled}/5`, 'fields filled', 'hsl(215 25% 27%)', CheckCircle2)}
        {statCard('Site Name', settings.siteName ? 'Set' : 'Default', settings.siteName || 'Travels OTA', 'hsl(var(--chart-1))', Globe)}
        {statCard('Contact', settings.phone || settings.email ? 'Yes' : '—', settings.phone || settings.email || 'Add phone/email', 'hsl(var(--chart-3))', Globe)}
      </section>

      <div className="grid gap-5 lg:grid-cols-5">

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Brand & Contact</h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="siteName" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Site Name</label>
              <Input id="siteName" name="siteName" className={inputCls} defaultValue={settings.siteName ?? ''} placeholder="Travels OTA" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
              <Input id="phone" name="phone" className={inputCls} defaultValue={settings.phone ?? ''} placeholder="+1 (555) 000-0000" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="whatsapp" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp</label>
              <Input id="whatsapp" name="whatsapp" className={inputCls} defaultValue={settings.whatsapp ?? ''} placeholder="+1 (555) 000-0000" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
              <Input id="email" name="email" className={inputCls} defaultValue={settings.email ?? ''} placeholder="hello@travelsota.com" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="location" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
              <Input id="location" name="location" className={inputCls} defaultValue={settings.location ?? ''} placeholder="Istanbul, Turkey" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="tagline" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tagline</label>
              <Input id="tagline" name="tagline" className={inputCls} defaultValue={settings.tagline ?? ''} placeholder="Flights and hotels for customers, agents and travel teams." disabled={!canEdit} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Social Links</h2>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={addSocialLink} disabled={isSaving}>
                <Plus className="size-3.5" /> Add
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Only links with valid URLs are shown in the footer.</p>

          {socialLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <Share2 className="mb-3 size-8 text-muted-foreground/25" />
              <p className="text-sm font-medium text-muted-foreground">No social links</p>
              {canEdit && <p className="mt-1 text-xs text-muted-foreground">Click Add to create one.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {socialLinks.map((link, index) => (
                <div key={index} className="group flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/20">
                  <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40" />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {link.platform && SOCIAL_ICON_MAP[link.platform] ? SOCIAL_ICON_MAP[link.platform] : <Share2 className="size-3" />}
                  </span>
                  <select
                    aria-label="Platform"
                    value={link.platform}
                    onChange={(e) => updateSocialLink(index, 'platform', e.target.value)}
                    disabled={!canEdit || isSaving}
                    className="h-8 min-w-0 shrink-0 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 sm:w-28"
                  >
                    <option value="" disabled>Pick</option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <Input
                    value={link.url}
                    onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
                    placeholder="https://"
                    disabled={!canEdit || isSaving}
                    className="h-8 flex-1 text-xs"
                  />
                  {canEdit && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSocialLink(index)} disabled={isSaving} className="size-7 shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 border-t border-border/70 pt-4">
          <Button type="submit" disabled={isSaving} className="min-w-[140px]">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          You do not have permission to edit site settings. Contact a super admin.
        </div>
      )}
    </form>
  );
}

function ContactSettingsInner() {
  const { data: settings, isLoading } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(PermissionCode.SETTINGS_MANAGE_SITE);

  if (isLoading || !settings) {
    return (
      <div className="space-y-5">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />))}
        </div>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>
          <div className="lg:col-span-2"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>
        </div>
      </div>
    );
  }

  return (
    <ContactSettingsEditor
      settings={settings}
      canEdit={canEdit}
      isSaving={updateMutation.isPending}
      onSave={(data) => updateMutation.mutate(data)}
    />
  );
}

function ContactSettingsPageWrapper() {
  return (
    <RequirePagePermission permissions={[PermissionCode.SETTINGS_READ]}>
      <ContactSettingsInner />
    </RequirePagePermission>
  );
}

export default function ContactSettingsPage() {
  return (
    <Suspense fallback={<div className="space-y-5"><div className="h-5 w-48 animate-pulse rounded bg-muted" /><div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div><div className="grid gap-5 lg:grid-cols-5"><div className="lg:col-span-3"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div><div className="lg:col-span-2"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div></div></div>}>
      <ContactSettingsPageWrapper />
    </Suspense>
  );
}
