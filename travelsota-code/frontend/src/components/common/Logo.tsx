'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useSiteBranding } from '@/components/common/BrandingProvider';
import { optimizedImageUrl } from '@/features/admin/api/admin-settings';

const SIZES = {
  // Uploaded logos render ~2.5× the built-in badge size so wide lockup
  // artwork (e.g. 574×214) stays legible — the old h-8/h-9 caps squeezed a
  // horizontal lockup down to ~96px wide, making the wordmark unreadable.
  // Proportional scaling for dynamic brand logos (square, 3:1, up to ultra-wide 7:1):
  // - sm: sidebars, horizontal sub-bars, mobile drawers (up to 36px height, max 175px width)
  // - md: main header / navbar (up to 44px height, max 230px width — balanced in 64-80px headers)
  // - lg: footer, auth cards, splash branding (up to 50px height, max 260px width)
  sm: {
    badge: 'h-8 w-8 rounded-[10px]',
    text: 'text-base sm:text-lg',
    plane: 'h-[15px] w-[15px]',
    logoImg: 'h-7 sm:h-8 md:h-9 max-h-9 max-w-[140px] sm:max-w-[160px] md:max-w-[175px]',
  },
  md: {
    badge: 'h-9 w-9 rounded-[11px]',
    text: 'text-lg sm:text-xl',
    plane: 'h-[18px] w-[18px]',
    logoImg: 'h-8 sm:h-9 md:h-10 lg:h-11 max-h-11 max-w-[160px] sm:max-w-[190px] md:max-w-[215px] lg:max-w-[230px]',
  },
  lg: {
    badge: 'h-11 w-11 rounded-xl',
    text: 'text-xl sm:text-2xl',
    plane: 'h-[22px] w-[22px]',
    logoImg: 'h-10 sm:h-11 md:h-12 max-h-12 max-w-[200px] sm:max-w-[230px] md:max-w-[260px]',
  },
} as const;

export type LogoSize = keyof typeof SIZES;

function PlaneBadge({ className, plane }: { className: string; plane: string }) {
  return (
    <span
      className={`${className} relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-teal via-brand-teal-600 to-brand-teal-800 text-white shadow-[0_6px_16px_rgba(3,61,74,0.32)] ring-1 ring-white/25 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-[1.04]`}
      aria-hidden
    >
      {/* Soft top-left shine for a polished, dimensional look */}
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_90%_at_18%_0%,rgba(255,255,255,0.34),transparent_55%)]" />
      {/* Filled airplane mark */}
      <svg className={`relative ${plane}`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    </span>
  );
}

export function Logo({
  size = 'md',
  onDark = false,
  href = '/',
  withLink = true,
  compact = false,
  className,
  imageClassName,
}: {
  size?: LogoSize;
  onDark?: boolean;
  href?: string;
  withLink?: boolean;
  compact?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const s = SIZES[size];
  const t = useTranslations('Common');
  const travel = onDark ? 'text-white' : 'text-zinc-900';
  const ota = onDark ? 'text-brand-teal-300' : 'text-brand-teal';

  // FOUC-prevention: BEFORE branding resolves we render a stable skeleton
  // (same size, no default mark, no image) — the admin's logo (or the built-in
  // mark when nothing is set) appears only once we're ready. No default flash.
  //
  // Uses `logoReady`, not the composite `ready` — `ready` goes true as soon
  // as ANY branding field resolves (title, hero, favicon, ...), which let
  // this component render the built-in default mark while the logo itself
  // was still unresolved (a transient failure on just that field was enough
  // to look, from `ready`'s point of view, like "confirmed: no logo"). The
  // built-in mark below should only ever appear once the logo specifically
  // has had a real chance to load.
  const { bundle, logoReady } = useSiteBranding();
  // Cap display width: rendered at most ~260px — a 4000px original wastes MBs.
  const logoUrl = bundle.logo ? optimizedImageUrl(bundle.logo, 500) : bundle.logo;

  let content: React.JSX.Element;
  if (!logoReady) {
    content = <span className={`${s.badge} shrink-0 rounded-[10px] bg-zinc-200/60`} aria-hidden />;
  } else if (compact) {
    if (bundle.favicon) {
      content = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bundle.favicon}
          alt={t('siteLogoAlt')}
          className={cn('size-8 shrink-0 object-contain rounded-lg transition-transform duration-200 group-hover:scale-105', imageClassName)}
        />
      );
    } else if (logoUrl) {
      content = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={t('siteLogoAlt')}
          className={cn('size-8 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105', imageClassName)}
        />
      );
    } else {
      content = <PlaneBadge className={s.badge} plane={s.plane} />;
    }
  } else if (logoUrl) {
    content = (
      // eslint-disable-next-line @next/next/no-img-element -- uploaded logo can be any host; next/image would reject non-whitelisted origins
      <img
        src={logoUrl}
        alt="Site logo"
        className={cn(
          'w-auto h-auto object-contain object-left transition-transform duration-200 group-hover:scale-[1.02]',
          s.logoImg,
          imageClassName
        )}
      />
    );
  } else {
    content = (
      <span className="group inline-flex items-center gap-2.5">
        <PlaneBadge className={s.badge} plane={s.plane} />
        {!compact && (
          <span className={`font-logo font-bold tracking-tight ${s.text} leading-none`}>
            <span className={travel}>Travels</span>
            <span className={ota}> OTA</span>
          </span>
        )}
      </span>
    );
  }

  if (!withLink) {
    return <div className={cn('inline-flex items-center', className)}>{content}</div>;
  }

  return (
    <Link
      href={href}
      aria-label={t('logoBackHome')}
      className={cn(
        'flex shrink-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-teal',
        className
      )}
    >
      {content}
    </Link>
  );
}