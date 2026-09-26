'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  ImageUp,
  Trash2,
  Loader2,
  SlidersHorizontal,
  Palette,
  ImageIcon,
  Plane,
  Hotel,
  Info,
  Globe,
  Save,
  CalendarCheck,
} from 'lucide-react';
import Switch from '@/components/form/switch/Switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getGeneralSettings,
  updateGeneralSetting,
  uploadHeroImage,
  optimizedImageUrl,
  type GeneralSettings,
  type HeroBackgrounds,
  type SiteBranding,
} from '@/features/admin/api/admin-settings';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';

type SettingsNav = 'general' | 'branding' | 'bookings';

const NAV_ITEMS: Array<{ id: SettingsNav; label: string; hint: string; icon: typeof SlidersHorizontal; accent: string }> = [
  { id: 'general', label: 'General', hint: 'Behavior & booking', icon: SlidersHorizontal, accent: 'from-brand-teal to-brand-teal-400' },
  { id: 'branding', label: 'Branding', hint: 'Logo, favicon & hero', icon: Palette, accent: 'from-indigo-500 to-violet-500' },
  { id: 'bookings', label: 'Bookings', hint: 'Issue & hold policy', icon: CalendarCheck, accent: 'from-amber-500 to-orange-500' },
];

interface SettingsSectionProps {
  title: string;
  description: string;
  Icon: typeof Users;
  accent: string;
  children: React.ReactNode;
}

function SettingsSection({ title, description, Icon, accent, children }: SettingsSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.06),0_8px_24px_-18px_hsl(var(--foreground)/0.25)]">
      <header className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', accent)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold tracking-tight text-foreground">{title}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function GeneralSettingsTab() {
  const [activeNav, setActiveNav] = useState<SettingsNav>('general');

  const toasts = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<GeneralSettings>({
    queryKey: ['admin', 'settings', 'general'],
    queryFn: getGeneralSettings,
  });

  const guestBookingMutation = useMutation({
    mutationFn: (enabled: boolean) => updateGeneralSetting('guestBookingEnabled', enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old ? { ...old, guestBookingEnabled: enabled } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to update setting', 'Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] }),
  });

  const breakdownMutation = useMutation({
    mutationFn: (enabled: boolean) => updateGeneralSetting('showPriceBreakdown', enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old ? { ...old, showPriceBreakdown: enabled } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to update setting', 'Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] }),
  });

  const autoIssueMutation = useMutation({
    mutationFn: (enabled: boolean) => updateGeneralSetting('bookingCustomerConfirm', enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old ? { ...old, bookingCustomerConfirm: enabled } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to update setting', 'Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] }),
  });

  const guestEnabled = settings?.guestBookingEnabled ?? true;
  const breakdownEnabled = settings?.showPriceBreakdown ?? false;
  const autoIssueEnabled = settings?.bookingCustomerConfirm ?? true;

  // Site title/description drafts — start as null ("untouched"): the inputs
  // show the saved value, and Save only applies what the admin changed.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const shownTitle = titleDraft ?? settings?.siteTitle ?? '';
  const shownDesc = descDraft ?? settings?.siteDescription ?? '';
  const metaChanged =
    (titleDraft !== null && titleDraft !== (settings?.siteTitle ?? '')) ||
    (descDraft !== null && descDraft !== (settings?.siteDescription ?? ''));

  const saveMetaMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        updateGeneralSetting('siteTitle', titleDraft ?? (settings?.siteTitle ?? '')),
        updateGeneralSetting('siteDescription', descDraft ?? (settings?.siteDescription ?? '')),
      ]);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old
          ? { ...old, siteTitle: shownTitle, siteDescription: shownDesc }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to save site identity', 'Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] });
      setTitleDraft(null);
      setDescDraft(null);
    },
    onSuccess: () => {
      toasts.success('Site identity updated', 'Title and description are now live site-wide.');
    },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {/* ── Vertical navigation ── */}
      <nav aria-label="General settings sections" className="h-fit rounded-2xl border border-border/70 bg-card p-2 shadow-[0_1px_3px_hsl(var(--foreground)/0.06)] lg:sticky lg:top-20">
        <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Settings</p>
        {NAV_ITEMS.map(({ id, label, hint, icon: Icon, accent }) => {
          const active = activeNav === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveNav(id)}
              className={cn(
                'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200',
                active ? 'bg-brand-teal/[0.07]' : 'hover:bg-muted/50',
              )}
            >
              {/* Brand-teal left accent bar on the active item */}
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-opacity duration-200',
                  active ? cn('bg-gradient-to-b opacity-100', accent) : 'opacity-0',
                )}
                aria-hidden
              />
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                  active
                    ? cn('bg-gradient-to-br from-brand-teal to-brand-teal-700 text-white shadow-[0_6px_16px_rgba(3,61,74,0.3)]')
                    : 'bg-muted text-muted-foreground group-hover:text-brand-teal',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-semibold', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                  {label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground/70">{hint}</span>
              </span>
              {active && (
                <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-brand-teal/10">
                  <span className="size-1.5 rounded-full bg-brand-teal" aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Active pane ── */}
      <div className="min-w-0 space-y-4">
        {activeNav === 'general' ? (
          <>
            <SettingsSection
              title="Site identity"
              description="Used in the browser tab, search results, and social previews."
              Icon={Globe}
              accent="from-sky-500 to-blue-600"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Site Title
                    <span className="ml-1 text-[10px] font-medium text-muted-foreground">({shownTitle.length}/120)</span>
                  </label>
                  <Input
                    value={shownTitle}
                    placeholder="TravelsOTA"
                    maxLength={120}
                    onChange={(e) => setTitleDraft(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The name shown in the browser tab and search-engine headlines. Leave empty to keep the built-in default.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Site Description
                    <span className="ml-1 text-[10px] font-medium text-muted-foreground">({shownDesc.length}/300)</span>
                  </label>
                  <textarea
                    value={shownDesc}
                    placeholder="Book flights and hotels worldwide with real-time pricing..."
                    maxLength={300}
                    rows={3}
                    onChange={(e) => setDescDraft(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    A short one-liner for search engines and social shares. Leave empty to keep the built-in default.
                  </p>
                </div>
                <Button
                  onClick={() => saveMetaMutation.mutate()}
                  disabled={!metaChanged || saveMetaMutation.isPending}
                  className="bg-[#0369a1] text-white hover:bg-[#075985] disabled:opacity-50"
                >
                  {saveMetaMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 size-3.5" />
                      Save &amp; apply site-wide
                    </>
                  )}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Booking policies"
              description="Platform-wide behavior that affects how users book."
              Icon={Users}
              accent="from-brand-teal to-brand-teal-400"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Guest Booking</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {guestEnabled
                        ? 'Visitors can search, select, and book without an account. They can optionally create one after booking.'
                        : 'Users must sign in before confirming a booking. Browsing and search stay open.'}
                    </p>
                  </div>
                  {isLoading ? (
                    <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <Switch
                      label="Guest Booking"
                      checked={guestEnabled}
                      onChange={(checked) => guestBookingMutation.mutate(checked)}
                    />
                  )}
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Price Breakdown</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {breakdownEnabled
                        ? 'Admins and agents see supplier amount, markup, and commission on offers.'
                        : 'Only the final price is shown to customers — with the same view for admins and agents.'}
                    </p>
                  </div>
                  {isLoading ? (
                    <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <Switch
                      label="Price Breakdown"
                      checked={breakdownEnabled}
                      onChange={(checked) => breakdownMutation.mutate(checked)}
                    />
                  )}
                </div>
              </div>
            </SettingsSection>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/60 bg-sky-50/60 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <Info className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <p className="text-xs leading-relaxed text-sky-800 dark:text-sky-300">
                Not seeing what you expected? General settings apply instantly site-wide. Toggle changes affect the checkout flow only.
              </p>
            </div>
          </>
        ) : activeNav === 'branding' ? (
          <BrandingPane branding={settings?.branding ?? {}} heroBackgrounds={settings?.heroBackgrounds ?? {}} />
        ) : (
          <>
            <SettingsSection
              title="Booking Payment Issue"
              description="Who issues tickets after payment succeeds."
              Icon={CalendarCheck}
              accent="from-amber-500 to-orange-500"
            >
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Auto-Issue After Payment</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {autoIssueEnabled
                      ? 'Bookings are ticketed automatically the moment payment succeeds.'
                      : 'Bookings stay held after payment until an admin verifies and issues them manually.'}
                  </p>
                </div>
                {isLoading ? (
                  <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                ) : (
                  <Switch
                    label="Auto-Issue After Payment"
                    checked={autoIssueEnabled}
                    onChange={(checked) => autoIssueMutation.mutate(checked)}
                  />
                )}
              </div>
            </SettingsSection>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                <p className="font-semibold">How manual issuing works</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Enabled: tickets issue automatically after successful payment.</li>
                  <li>Disabled: bookings wait as held — an admin issues them from the booking workspace.</li>
                  <li>Bank-transfer and pay-later bookings always wait for admin review.</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Branding ────────────────────────────────────────────────────────────────

// ─── Asset validation (per-field format + dimensions) ──────────────────────

interface AssetRules {
  /** Allowed MIME types. */
  mimes: string[];
  /** Human-readable format list for errors/hints. */
  formatsLabel: string;
  /** Client-side dimension check; returns error message or null. */
  dimensions: (w: number, h: number) => string | null;
}

const ASSET_RULES: Record<string, AssetRules> = {
  logo: {
    mimes: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'],
    formatsLabel: 'SVG, PNG, JPG, or WebP',
    dimensions: (w, h) =>
      w < 48 || h < 20 ? 'Logo is too small — minimum dimensions are 48×20px.' :
      null,
  },
  favicon: {
    mimes: ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/png'],
    formatsLabel: 'SVG, ICO, or PNG — square',
    dimensions: (w, h) =>
      (w < 16 || h < 16) ? 'Favicon is too small — minimum 16×16.' :
      Math.abs(w - h) > 8 ? `Favicon must be square — got ${w}×${h}.` :
      (w > 512 ? 'Favicon should be 512×512 or smaller.' : null),
  },
  hero: {
    mimes: ['image/jpeg', 'image/webp', 'image/png'],
    formatsLabel: 'JPG, WebP, or PNG — wide',
    dimensions: (w) =>
      w < 800 ? `Hero image is too small (${w}px wide) — use at least 1600px wide.` : null,
  },
};

/** Reads the file's natural dimensions and applies the field's rules. */
function validateAssetFile(
  file: File,
  rules: AssetRules,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!rules.mimes.includes(file.type)) {
      resolve(`Wrong format — accepted: ${rules.formatsLabel}.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      resolve('Image too large — maximum size is 10 MB.');
      return;
    }
    if (file.type === 'image/svg+xml') {
      resolve(null); // SVG has no intrinsic pixel size to check
      return;
    }
    const url = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.onload = () => {
      const err = rules.dimensions(img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve(err);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('Could not read the image — the file may be corrupt.');
    };
    img.src = url;
  });
}

/** Cache-bust so browser-favicon/header caches pick up the new asset immediately. */
function bust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

const BRANDING_ASSETS: Array<{
  key: 'logo' | 'favicon';
  label: string;
  hint: string;
  spec: string;
  accept: string;
  rulesKey: keyof typeof ASSET_RULES;
}> = [
  {
    key: 'logo',
    label: 'Site Logo',
    hint: 'Header, footer, auth & admin',
    spec: 'SVG, PNG, JPG, or WebP · Best: ~3:1 to 4:1 ratio (e.g. 400×100px or 600×150px) · Any ratio auto-fits cleanly',
    accept: '.svg,.png,.jpg,.jpeg,.webp',
    rulesKey: 'logo',
  },
  {
    key: 'favicon',
    label: 'Favicon',
    hint: 'Browser tab — everywhere',
    spec: 'SVG, ICO, or PNG · square · 512×512 or smaller',
    accept: '.svg,.ico,.png',
    rulesKey: 'favicon',
  },
];

function BrandingPane({ branding, heroBackgrounds }: { branding: SiteBranding; heroBackgrounds: HeroBackgrounds }) {
  const toasts = useToast();
  const queryClient = useQueryClient();

  const saveBrandingMutation = useMutation({
    mutationFn: (next: SiteBranding) => updateGeneralSetting('branding', next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old ? { ...old, branding: next } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to save branding asset', 'Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] }),
  });

  const [pendingKey, setPendingKey] = useState<keyof SiteBranding | null>(null);
  const pendingRef = useRef<Record<string, HTMLInputElement | null>>({});

  const handleBrandingFile = async (key: keyof SiteBranding, file: File | undefined) => {
    if (!file) return;
    const error = await validateAssetFile(file, ASSET_RULES[key]);
    if (error) {
      toasts.error(error, key === 'logo'
        ? 'Recommended: SVG or transparent PNG, horizontal layout (e.g. 400×100px).'
        : 'Recommended: SVG, ICO, or PNG — square, 512×512 or smaller.');
      if (pendingRef.current[key]) pendingRef.current[key]!.value = '';
      return;
    }
    setPendingKey(key);
    try {
      const url = bust(await uploadHeroImage(file));
      saveBrandingMutation.mutate({ ...branding, [key]: url });
      toasts.success(`${key === 'logo' ? 'Logo' : 'Favicon'} uploaded`, 'Applied site-wide.');
    } catch (err) {
      toasts.error('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPendingKey(null);
      if (pendingRef.current[key]) pendingRef.current[key]!.value = '';
    }
  };

  const handleBrandingRemove = (key: keyof SiteBranding) => {
    const next = { ...branding };
    delete next[key];
    saveBrandingMutation.mutate(next);
    toasts.info(`${key === 'logo' ? 'Logo' : 'Favicon'} removed`, 'The bundled default is back in use.');
  };

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Site identity"
        description="These assets replace the built-in defaults wherever the brand appears. Recommended logo: horizontal orientation with transparent background (~3:1 to 4:1 ratio, e.g. 400×100px or 600×150px). All ratios (including ultra-wide banners or square marks) are safely scaled without stretching or overflowing."
        Icon={ImageIcon}
        accent="from-indigo-500 to-violet-500"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BRANDING_ASSETS.map(({ key, label, hint, accept, spec }) => {
            const url = branding[key] ?? null;
            const isPending = pendingKey === key;
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                <div className='relative flex h-32 items-center justify-center bg-muted'>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded asset can be any host; next/image would reject non-whitelisted origins
                    <img
                      src={optimizedImageUrl(url)}
                      alt={`${label} preview`}
                      className={cn(
                        'size-full object-contain p-3',
                        key === 'logo' && 'h-full w-full max-h-32'
                      )}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground/60">
                      <span className={cn('flex size-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5')}>
                        <ImageIcon className={cn('size-4', key === 'logo' ? 'text-indigo-500' : 'text-amber-500')} />
                      </span>
                      <span className="text-[10px] font-medium">Default in use</span>
                    </div>
                  )}
                  {isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-[2px]">
                      <Loader2 className="size-5 animate-spin text-brand-teal" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{label}</p>
                    <p className="truncate text-[10px] font-medium text-brand-teal/80" title={hint}>{spec}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {url && (
                      <button
                        type="button"
                        onClick={() => handleBrandingRemove(key)}
                        disabled={saveBrandingMutation.isPending}
                        title="Remove — revert to default"
                        aria-label={`Remove ${label}`}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => pendingRef.current[key]?.click()}
                      disabled={isPending || saveBrandingMutation.isPending}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#033d4a] px-3.5 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(3,61,74,0.25)] transition-all hover:bg-[#022f3a] hover:shadow-md active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ImageUp className="size-3.5" />
                      Upload
                    </button>
                    <input
                      ref={(el) => { pendingRef.current[key] = el; }}
                      type="file"
                      accept={accept}
                      className="hidden"
                      onChange={(e) => void handleBrandingFile(key, e.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <HeroBackgroundsSection backgrounds={heroBackgrounds} />
    </div>
  );
}

// ─── Hero Backgrounds ───────────────────────────────────────────────────────

const HERO_MODULES: Array<{ key: keyof HeroBackgrounds; label: string; hint: string; Icon: typeof Plane; accept: string; rulesKey: string }> = [
  { key: 'flights', label: 'Flights', hint: 'JPG/WebP/PNG · 1920×720 or wider', Icon: Plane, accept: '.jpg,.jpeg,.webp,.png', rulesKey: 'hero' },
  { key: 'hotels', label: 'Hotels', hint: 'JPG/WebP/PNG · 1920×720 or wider', Icon: Hotel, accept: '.jpg,.jpeg,.webp,.png', rulesKey: 'hero' },
];

function HeroBackgroundsSection({ backgrounds }: { backgrounds: HeroBackgrounds }) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<keyof HeroBackgrounds | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const saveMutation = useMutation({
    mutationFn: (next: HeroBackgrounds) => updateGeneralSetting('heroBackgrounds', next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'settings', 'general'] });
      const previous = queryClient.getQueryData<GeneralSettings>(['admin', 'settings', 'general']);
      queryClient.setQueryData<GeneralSettings>(['admin', 'settings', 'general'], (old) =>
        old ? { ...old, heroBackgrounds: next } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'settings', 'general'], context.previous);
      }
      toasts.error('Failed to save hero image', 'Please try again.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'general'] }),
  });

  const handleFile = async (moduleKey: keyof HeroBackgrounds, file: File | undefined) => {
    if (!file) return;
    const error = await validateAssetFile(file, ASSET_RULES.hero);
    if (error) {
      toasts.error(error, 'Recommended: JPG or WebP, 1920×720 or wider (16:6 landscape).');
      if (inputRefs.current[moduleKey]) inputRefs.current[moduleKey]!.value = '';
      return;
    }
    setPendingKey(moduleKey);
    try {
      const url = await uploadHeroImage(file);
      saveMutation.mutate({ ...backgrounds, [moduleKey]: url });
      toasts.success(`${moduleKey === 'flights' ? 'Flights' : 'Hotels'} hero updated`, 'Live on the homepage now.');
    } catch (err) {
      toasts.error('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPendingKey(null);
      if (inputRefs.current[moduleKey]) inputRefs.current[moduleKey]!.value = '';
    }
  };

  const handleRemove = (moduleKey: keyof HeroBackgrounds) => {
    const next = { ...backgrounds };
    delete next[moduleKey];
    saveMutation.mutate(next);
    toasts.info('Hero image removed', 'The bundled default is back in use.');
  };

  return (
    <SettingsSection
      title="Hero backgrounds"
      description="One wide image per search module — shown when that tab is active on the homepage."
      Icon={ImageUp}
      accent="from-brand-teal to-brand-teal-400"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {HERO_MODULES.map(({ key, label, hint, Icon, accept }) => {
          const url = backgrounds[key] ?? null;
          const isPending = pendingKey === key;
          return (
            <div key={key} className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              <div className="relative aspect-[16/6] w-full bg-muted">
                {url ? (
                  <Image
                    src={optimizedImageUrl(url)}
                    alt={`${label} hero background`}
                    fill
                    sizes="(max-width: 640px) 100vw, 480px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground/60">
                    <span className={cn('flex size-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5')}>
                      <Icon className={cn('size-5', key === 'flights' ? 'text-sky-600' : 'text-emerald-600')} />
                    </span>
                    <span className="text-[10px] font-medium">Default image in use</span>
                  </div>
                )}
                {isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-[2px]">
                    <Loader2 className="size-5 animate-spin text-brand-teal" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{label} hero</p>
                  <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {url && (
                    <button
                      type="button"
                      onClick={() => handleRemove(key)}
                      disabled={saveMutation.isPending}
                      title="Remove — revert to default"
                      aria-label={`Remove ${label} hero image`}
                      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => inputRefs.current[key]?.click()}
                    disabled={isPending || saveMutation.isPending}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#033d4a] px-3.5 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(3,61,74,0.25)] transition-all hover:bg-[#022f3a] hover:shadow-md active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImageUp className="size-3.5" />
                    Upload
                  </button>
                  <input
                    ref={(el) => { inputRefs.current[key] = el; }}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(e) => void handleFile(key, e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}