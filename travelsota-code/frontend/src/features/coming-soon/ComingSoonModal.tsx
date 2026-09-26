'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'motion/react';

export interface ComingSoonModule {
  key: string;
  label: string;
  /** Short label for tight UI rows (module switcher); falls back to `label`. */
  shortLabel?: string;
  description: string;
  icon: string; // svg path
}

export const COMING_SOON_MODULES: ComingSoonModule[] = [
  {
    key: 'tours',
    label: 'Tour Packages',
    shortLabel: 'Tours',
    description: 'Curated holiday packages, guided tours, and group travel itineraries across top destinations.',
    icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5 0 4.5-4.036 4.5-9S14.5 3 12 3 7.5 7.036 7.5 12s2 9 4.5 9zm-7.5-9h15',
  },
  {
    key: 'cars',
    label: 'Car Rentals',
    shortLabel: 'Car Rentals',
    description: 'Self-drive and chauffeur services at airports and city centres, from economy to luxury.',
    icon: 'M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14m-14 0a2 2 0 00-2 2v3a1 1 0 001 1h1a1 1 0 001-1v-1h14v1a1 1 0 001 1h1a1 1 0 001-1v-3a2 2 0 00-2-2m-14 0h14M7 16h.01M17 16h.01',
  },
  {
    key: 'visa',
    label: 'Visa Services',
    shortLabel: 'Visa',
    description: 'Visa application assistance, document preparation, and processing for 100+ destinations.',
    icon: 'M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z',
  },
  {
    key: 'esim',
    label: 'eSIM & Connectivity',
    shortLabel: 'eSIM',
    description: 'Instant international eSIM plans for data, calls, and messaging in 150+ countries.',
    icon: 'M12 18.75a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5.635 12.885a9 9 0 0112.73 0M2.99 8.91a13.5 13.5 0 0118.02 0M.75 4.933a18 18 0 0122.5 0',
  },
  {
    key: 'umrah',
    label: 'Umrah Packages',
    shortLabel: 'Umrah',
    description: 'Complete Umrah packages with flights, hotels near the Haram, and ground transport.',
    icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  },
];

const COMING_SOON_BY_KEY = new Map(COMING_SOON_MODULES.map((m) => [m.key, m]));

export function ComingSoonModal({
  moduleKey,
  onClose,
}: {
  moduleKey: string | null;
  onClose: () => void;
}) {
  const mod = moduleKey ? COMING_SOON_BY_KEY.get(moduleKey) ?? null : null;
  const t = useTranslations('Home');
  const tc = useTranslations('Common');

  const moduleText = (key: string): { label: string; description: string } => {
    switch (key) {
      case 'tours': return { label: t('comingSoonToursLabel'), description: t('comingSoonToursDesc') };
      case 'cars': return { label: t('comingSoonCarsLabel'), description: t('comingSoonCarsDesc') };
      case 'visa': return { label: t('comingSoonVisaLabel'), description: t('comingSoonVisaDesc') };
      case 'esim': return { label: t('comingSoonEsimLabel'), description: t('comingSoonEsimDesc') };
      case 'umrah': return { label: t('comingSoonUmrahLabel'), description: t('comingSoonUmrahDesc') };
      default: return { label: mod?.label ?? key, description: mod?.description ?? '' };
    }
  };

  useEffect(() => {
    if (!mod) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [mod, onClose]);

  return (
    <AnimatePresence>
      {mod && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${moduleText(mod.key).label} — ${tc('comingSoon')}`}
        >
          <div className="fixed inset-0 z-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-[0_32px_80px_rgba(3,61,74,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors"
              aria-label={tc('close')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/[0.06] text-brand-teal mb-5">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
              </svg>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {tc('comingSoon')}
            </span>

            <h2 className="mt-3 text-xl font-bold text-zinc-900 tracking-tight">{moduleText(mod.key).label}</h2>
            <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{moduleText(mod.key).description}</p>

            <div className="mt-6 rounded-xl bg-zinc-50 px-4 py-3">
              <p className="text-xs text-zinc-500">
                {t('comingSoonNotify', { module: moduleText(mod.key).label.toLowerCase(), site: tc('siteName') })}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] py-3 text-sm font-bold text-white shadow-lg shadow-brand-teal/25 hover:shadow-brand-teal/40 transition-all duration-200"
            >
              {tc('gotIt')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
