'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from 'next-intl';
import { CurrencySelector } from '@/components/common/CurrencySelector';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import { useCmsMenu } from '@/features/cms/hooks';
import { useRouter } from 'next/navigation';
import { Logo } from "@/components/common/Logo";
import { ComingSoonModal, COMING_SOON_MODULES } from '@/features/coming-soon/ComingSoonModal';

import { usePublicModules } from '@/features/home/hooks/usePublicModules';
import type { PublicModulesInfo } from '@/features/admin/api/admin-settings';

/** Hide/rename the Flights & Hotels nav entries from the module visibility config. */
function applyModuleNav<T extends { href: string; label: string }>(items: T[], modules: PublicModulesInfo | null): T[] {
  const visible = (href: string) => {
    if (href.includes('/flights')) return modules ? modules.flights.enabled : true;
    if (href.includes('/hotels')) return modules ? modules.hotels.enabled : true;
    return true;
  };
  return items
    .filter((item) => visible(item.href))
    .map((item) => ({
      ...item,
      label: item.href.includes('/flights')
        ? (modules?.flights.name || item.label)
        : item.href.includes('/hotels')
          ? (modules?.hotels.name || item.label)
          : item.label,
    }));
}

function getDefaultNavItems(t: ReturnType<typeof useTranslations<'Nav'>>) {
  return [
    { href: '/flights', label: t('flights') },
    { href: '/hotels', label: t('hotels') },
    { href: '/blog', label: t('blog') },
  ];
}

const ease = [0.16, 1, 0.3, 1] as const;

// ─── Tiny helpers ──────────────────────────────────────────

function UserAvatar({
  initial,
  large,
  avatarUrl,
}: {
  initial: string;
  large?: boolean;
  avatarUrl?: string | null;
}) {
  const sizeClass = large ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[11px]';
  const tc = useTranslations('Common');
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={tc('profilePhotoAlt')}
        className={`inline-block rounded-full object-cover ring-2 ring-white/30 ${sizeClass}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-[#0a5a6b] font-bold text-white ring-2 ring-white/30 ${sizeClass}`}
    >
      {initial}
    </span>
  );
}

// ─── Dashboard link by user type ──────────────────────────

function DashboardButton({
  isAdmin,
  isAgent,
  scrolled,
}: {
  isAdmin: boolean;
  isAgent: boolean;
  scrolled: boolean;
}) {
  const t = useTranslations('Nav');
  const href = isAdmin ? '/admin' : isAgent ? '/agent' : '/dashboard';
  const label = isAdmin ? t('adminPanel') : isAgent ? t('agentHub') : t('myTrips');

  return (
    <Link
      href={href}
      className={`hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
        scrolled
          ? 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/[0.04]'
          : 'text-white/80 hover:text-white hover:bg-white/10'
      }`}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
        />
      </svg>
      {label}
    </Link>
  );
}

// ─── Auth Section (Desktop) ───────────────────────────────

function AuthArea({
  scrolled,
  onMobileClose,
  onOpenDemo,
}: {
  scrolled: boolean;
  onMobileClose?: () => void;
  onOpenDemo?: () => void;
}) {
  const { isAuthenticated, user, isAdmin, isAgent, logout } = useAuth();
  const t = useTranslations('Nav');
  const [userOpen, setUserOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
    const h = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, []);

  if (!mounted) {
    return <div className="flex items-center gap-2" />;
  }

  // ── Guest ──
  if (!isAuthenticated) {
    const linkBase = scrolled
      ? 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/[0.04]'
      : 'text-white/80 hover:text-white hover:bg-white/10';
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/signin"
          className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${linkBase}`}
        >
          {t('signIn')}
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-teal to-brand-teal-600 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(3,61,74,0.22)] ring-1 ring-brand-teal/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_22px_rgba(3,61,74,0.3)] active:scale-[0.97]"
        >
          {t('signUp')}
        </Link>
      </div>
    );
  }

  // ── Authenticated ──
  const initial = (user?.firstName ?? user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div ref={userRef} className="relative">
      <button
        type="button"
        onClick={() => setUserOpen((o) => !o)}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-200 ${
          scrolled ? 'hover:bg-zinc-100' : 'hover:bg-white/10'
        }`}
      >
        <UserAvatar initial={initial} avatarUrl={user?.avatarUrl} />
        <span
          className={`hidden lg:block max-w-[100px] truncate text-sm font-semibold ${
            scrolled ? 'text-zinc-700' : 'text-white'
          }`}
        >
          {user?.firstName ?? user?.email}
        </span>
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            userOpen ? 'rotate-180' : ''
          } ${scrolled ? 'text-zinc-400' : 'text-white/60'}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <AnimatePresence>
        {userOpen && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? {} : { opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease }}
            className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_24px_60px_rgba(3,61,74,0.18)]"
          >
            <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-100">
              <UserAvatar initial={initial} large avatarUrl={user?.avatarUrl} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">
                  {user?.firstName
                    ? `${user.firstName} ${user?.lastName ?? ''}`.trim()
                    : user?.email}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {isAdmin ? t('administrator') : isAgent ? t('userAgent') : t('userCustomer')}
                </p>
              </div>
            </div>
            <div className="py-1">
              <Link
                href="/profile"
                onClick={() => {
                  setUserOpen(false);
                  onMobileClose?.();
                }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-150 hover:bg-brand-teal/5 hover:text-brand-teal"
              >
                <svg
                  className="h-4 w-4 text-zinc-400 transition-colors duration-150 group-hover:text-brand-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
                {t('profile')}
              </Link>
              <Link
                href="/bookings"
                onClick={() => {
                  setUserOpen(false);
                  onMobileClose?.();
                }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-150 hover:bg-brand-teal/5 hover:text-brand-teal"
              >
                <svg
                  className="h-4 w-4 text-zinc-400 transition-colors duration-150 group-hover:text-brand-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
                {t('myBookings')}
              </Link>
              <Link
                href="/settings"
                onClick={() => {
                  setUserOpen(false);
                  onMobileClose?.();
                }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-150 hover:bg-brand-teal/5 hover:text-brand-teal"
              >
                <svg
                  className="h-4 w-4 text-zinc-400 transition-colors duration-150 group-hover:text-brand-teal"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {t('settings')}
              </Link>
            </div>
            <div className="border-t border-zinc-100 pt-1">
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  logout();
                }}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-all duration-150 hover:bg-red-50"
              >
                <svg
                  className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                  />
                </svg>
                {t('signOut')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mobile Drawer ─────────────────────────────────────────

function MobileDrawer({
  open,
  onClose,
  onComingSoon,
  onOpenDemo,
}: {
  open: boolean;
  onClose: () => void;
  onComingSoon?: (key: string) => void;
  onOpenDemo?: () => void;
}) {
  const { isAuthenticated, user, isAdmin, isAgent, logout } = useAuth();
  const t = useTranslations('Nav');
  const tc = useTranslations('Common');
  const pathname = usePathname();
  const defaultNavItems = getDefaultNavItems(t);
  const reducedMotion = useReducedMotion();
  const { modules: publicModules } = usePublicModules();
  const { data: cmsHeaderMenu } = useCmsMenu('HEADER');
  const navItems = applyModuleNav(
    [
      ...defaultNavItems.map((item) => ({ ...item, target: undefined as string | undefined })),
      ...(cmsHeaderMenu ?? []).map((item) => ({ href: item.url ?? '#', label: item.label, target: item.target })),
    ],
    publicModules,
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reducedMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease }}
            className="fixed inset-y-0 right-0 z-50 w-72 max-w-[82vw] bg-white shadow-2xl md:hidden flex flex-col"
          >
            {/* Drawer header */}
            <div className="flex min-h-[64px] items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <Link
                href="/"
                onClick={onClose}
                aria-label={tc('logoBackHome')}
                className="flex shrink-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-blue"
              >
                <Logo size="md" withLink={false} />
              </Link>
              <button
                onClick={onClose}
                aria-label={tc('closeMenu')}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {navItems.map((item) => {
                const activeClass = pathname?.startsWith(item.href)
                  ? 'bg-brand-teal/8 text-brand-teal'
                  : 'text-zinc-700 hover:bg-zinc-50';
                const linkClass = `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeClass}`;
                if (item.target === '_blank') {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onClose}
                      className={linkClass}
                    >
                      {item.label}
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={linkClass}
                  >
                    {item.label}
                  </Link>
                );
              })}

              {isAuthenticated && (
                <>
                  <div className="my-2 border-t border-zinc-100" />
                  <Link
                    href={
                      isAdmin ? '/admin' : isAgent ? '/agent' : '/dashboard'
                    }
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <svg
                      className="h-4 w-4 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                      />
                    </svg>
                    {isAdmin ? t('adminPanel') : isAgent ? t('agentHub') : t('myTrips')}
                  </Link>
                  <Link
                    href="/bookings"
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    {t('myBookings')}
                  </Link>
                </>
              )}

              {/* {t('moreServices')} (coming soon) */}
              <div className="pt-4">
                <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {t('moreServices')}
                </p>
                <div className="mt-1.5 grid grid-cols-1 gap-0.5">
                  {COMING_SOON_MODULES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        onClose();
                        onComingSoon?.(m.key);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-brand-teal/5 hover:text-brand-teal"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-teal/[0.08] text-brand-teal">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                        </svg>
                      </span>
                      <span className="flex-1 text-left">{m.shortLabel ?? m.label}</span>
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                        {t('soon')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Currency */}
            <div className="px-5 py-3 border-t border-zinc-100 shrink-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
                {t('currency')}
              </span>
              <div className="mt-2">
            <LanguageSelector transparent={false} />
            <CurrencySelector transparent={false} />
              </div>
            </div>

            {/* Auth actions */}
            <div className="p-4 border-t border-zinc-100 shrink-0">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-1 mb-3">
                    <UserAvatar
                      initial={
                        (user?.firstName ?? user?.email ?? '?')
                          .charAt(0)
                          .toUpperCase()
                      }
                      large
                      avatarUrl={user?.avatarUrl}
                    />
                    <div>
                      <p className="text-sm font-bold text-zinc-900">
                        {user?.firstName ?? user?.email}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {isAdmin ? t('adminShort') : isAgent ? t('agentShort') : t('userCustomer')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      logout();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] py-3 text-sm font-bold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/30 transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                      />
                    </svg>
                    {t('signOut')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    <Link
                      href="/signin"
                      onClick={onClose}
                      className="flex items-center justify-center rounded-xl border-2 border-brand-teal/20 py-3 text-sm font-bold text-brand-teal hover:border-brand-teal/40 hover:bg-brand-teal/[0.04] transition-all duration-200 active:scale-[0.97]"
                    >
                      {t('signIn')}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── SiteHeader ────────────────────────────────────────────

export function SiteHeader() {
  const pathname = usePathname();
  const { isAuthenticated, isAdmin, isAgent } = useAuth();
  const t = useTranslations('Nav');
  const tc = useTranslations('Common');
  const { data: cmsHeaderMenu } = useCmsMenu('HEADER');
  const { modules: publicModules } = usePublicModules();
  const defaultNavItems = getDefaultNavItems(t);
  const cmsItems = (cmsHeaderMenu ?? []).map((item) => ({ href: item.url ?? '#', label: item.label, target: item.target }));
  const MAX_VISIBLE_CMS = 3;
  const visibleCms = cmsItems.slice(0, MAX_VISIBLE_CMS);
  const overflowCms = cmsItems.slice(MAX_VISIBLE_CMS);
  const navItems = applyModuleNav(
    [
      ...defaultNavItems.map((item) => ({ ...item, target: undefined as string | undefined })),
      ...visibleCms.map((item) => ({ ...item, target: item.target as string | undefined })),
    ],
    publicModules,
  );
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [comingSoonModule, setComingSoonModule] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), [setMobileOpen]);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // Header sits in normal flow (sticky). `scrolled` only toggles the shadow.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close "More" dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  const headerBg = `sticky top-0 z-50 w-full border-b transition-[box-shadow,border-color] duration-200 ${
    scrolled
      ? 'border-zinc-200/70 bg-white shadow-[0_4px_24px_rgba(3,61,74,0.07)]'
      : 'border-zinc-100 bg-white'
  }`;
  const navBase = 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/4';
  const navActive = 'bg-brand-teal/8 text-brand-teal font-bold';
  const mobileBtn = 'text-zinc-600 hover:bg-zinc-100';

  return (
    <>
      <header className={headerBg}>
        {/* Comfortable header height: 64px mobile → 80px desktop. The old
            64→72px squeeze compressed the logo and controls. */}
        <div className="mx-auto flex h-16 md:h-20 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logo (left) */}
          <Logo size="md" />

          {/* Center nav (pill/segmented) */}
          <nav className="hidden md:flex items-center gap-1 mx-auto">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const linkClass = `relative rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${active ? navActive : navBase}`;
              if (item.target === '_blank') {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClass}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-xl bg-brand-teal/10 -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}

            {/* "More" dropdown — extra CMS pages + coming-soon services */}
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className={`relative rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
                  moreOpen ? navActive : navBase
                }`}
              >
                {t('more')}
                <svg
                  className={`ml-1 inline-block h-3.5 w-3.5 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {moreOpen && (
                <div className="absolute left-0 mt-2 w-72 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-[0_24px_60px_rgba(3,61,74,0.16)]">
                  {overflowCms.length > 0 && (
                    <>
                      <div className="pb-1">
                        {overflowCms.map((item) => {
                          const active = isActive(item.href);
                          const dropItem = active
                            ? 'bg-brand-teal/8 text-brand-teal'
                            : 'text-zinc-600 hover:bg-zinc-50';
                          if (item.target === '_blank') {
                            return (
                              <a
                                key={item.href}
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${dropItem}`}
                              >
                                {item.label}
                              </a>
                            );
                          }
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${dropItem}`}
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                      <div className="my-1.5 border-t border-zinc-100" />
                    </>
                  )}
                  <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    {t('moreServices')}
                  </p>
                  {COMING_SOON_MODULES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setComingSoonModule(m.key);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-brand-teal/5 hover:text-brand-teal"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/[0.08] text-brand-teal">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                        </svg>
                      </span>
                      <span className="flex-1 text-left">{m.shortLabel ?? m.label}</span>
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                        {t('soon')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSelector transparent={false} />
            <CurrencySelector transparent={false} />
            {mounted && isAuthenticated && (
              <DashboardButton isAdmin={isAdmin} isAgent={isAgent} scrolled={true} />
            )}
            <AuthArea scrolled={true} onMobileClose={closeMobile} />
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className={`ml-auto md:hidden flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${mobileBtn}`}
            aria-label={tc('toggleMenu')}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 7h16M4 12h16M4 17h16"
              />
            </svg>
          </button>
        </div>
      </header>
      <MobileDrawer
        open={mobileOpen}
        onClose={closeMobile}
        onComingSoon={setComingSoonModule}
      />
      <ComingSoonModal moduleKey={comingSoonModule} onClose={() => setComingSoonModule(null)} />
    </>
  );
}
