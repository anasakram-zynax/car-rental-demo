'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from 'next-intl';
import { CurrencySelector } from '@/components/common/CurrencySelector';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import { Logo } from '@/components/common/Logo';

const ease = [0.16, 1, 0.3, 1] as const;

function UserAvatar({ initial, large, avatarUrl }: { initial: string; large?: boolean; avatarUrl?: string | null }) {
  const tc = useTranslations('Common');
  const sizeClass = large ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[11px]';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={tc('profilePhotoAlt')} className={`inline-block rounded-full object-cover ring-2 ring-white/30 ${sizeClass}`} />;
  }
  return <span className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-[#0a5a6b] font-bold text-white ring-2 ring-white/30 ${sizeClass}`}>{initial}</span>;
}

// ─── Auth Section ──────────────────────────────────────────

function AuthArea({ scrolled, onMobileClose }: { scrolled: boolean; onMobileClose?: () => void }) {
  const { isAuthenticated, user, isAdmin, isAgent, logout } = useAuth();
  const t = useTranslations('Nav');
  const [userOpen, setUserOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    const h = (e: MouseEvent) => { if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false); if (signupRef.current && !signupRef.current.contains(e.target as Node)) setSignupOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!mounted) {
    return <div className="flex items-center gap-2" />;
  }

  if (!isAuthenticated) {
    const linkClass = scrolled ? 'text-zinc-600 hover:text-brand-teal' : 'text-white/80 hover:text-white';
    return (
      <div className="flex items-center gap-2">
        <Link href="/signin" className="relative rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-600 transition-all duration-200 hover:text-brand-teal hover:bg-brand-teal/[0.04] active:scale-[0.97]">{t('signIn')}</Link>
        <div ref={signupRef} className="relative">
          <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }} type="button" onClick={() => setSignupOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(3,61,74,0.25)] ring-1 ring-brand-teal/10 transition-all duration-200 hover:shadow-[0_6px_24px_rgba(3,61,74,0.35)] hover:ring-brand-teal/30">
            {t('signUp')}
            <motion.svg animate={{ rotate: signupOpen ? 180 : 0 }} transition={{ duration: 0.2, ease }} className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></motion.svg>
          </motion.button>
          <AnimatePresence>
            {signupOpen ? (
              <motion.div initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? {} : { opacity: 0, y: 6, scale: 0.96 }} transition={{ duration: 0.18, ease }} className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_24px_60px_rgba(3,61,74,0.18)]">
                <Link href="/signup?role=customer" onClick={() => { setSignupOpen(false); onMobileClose?.(); }} className="group flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-brand-teal/5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/8 text-brand-teal ring-1 ring-brand-teal/10 transition-transform duration-200 group-hover:scale-105">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 9a7 7 0 1 1 14 0H3Z"/></svg>
                  </span>
                  <span><span className="block text-sm font-bold text-zinc-900">{t('userCustomer')}</span><span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{t('bookForYourself')}</span></span>
                </Link>
                <Link href="/signup?role=agent" onClick={() => { setSignupOpen(false); onMobileClose?.(); }} className="group flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-brand-teal/5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/8 text-brand-teal ring-1 ring-brand-teal/10 transition-transform duration-200 group-hover:scale-105">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5Zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5Zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5Z" clipRule="evenodd"/></svg>
                  </span>
                  <span><span className="block text-sm font-bold text-zinc-900">{t('userAgent')}</span><span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{t('registerAgency')}</span></span>
                </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  const initial = (user?.firstName ?? user?.email ?? '?').charAt(0).toUpperCase();
  return (
    <div ref={userRef} className="relative">
      <button type="button" onClick={() => setUserOpen(o => !o)} className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-200 ${scrolled ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
        <UserAvatar initial={initial} avatarUrl={user?.avatarUrl} />
        <span className={`hidden lg:block max-w-[100px] truncate text-sm font-semibold ${scrolled ? 'text-zinc-700' : 'text-white'}`}>{user?.firstName ?? user?.email}</span>
        <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${userOpen ? 'rotate-180' : ''} ${scrolled ? 'text-zinc-400' : 'text-white/60'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
      </button>
      <AnimatePresence>
        {userOpen ? (
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? {} : { opacity: 0, y: 6, scale: 0.96 }} transition={{ duration: 0.18, ease }} className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_24px_60px_rgba(3,61,74,0.18)]">
            <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-100">
              <UserAvatar initial={initial} large avatarUrl={user?.avatarUrl} />
              <div className="min-w-0"><p className="text-sm font-bold text-zinc-900 truncate">{user?.firstName ? `${user.firstName} ${user?.lastName ?? ''}`.trim() : user?.email}</p><p className="text-[11px] text-zinc-500">{isAdmin ? t('administrator') : isAgent ? t('userAgent') : t('userCustomer')}</p></div>
            </div>
            <div className="py-1">
              <Link href="/bookings" onClick={() => { setUserOpen(false); onMobileClose?.(); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"><UserAvatar initial="B" /><span>{t('myBookings')}</span></Link>
              {(isAdmin || isAgent) ? <Link href={isAdmin ? '/admin' : '/agent'} onClick={() => { setUserOpen(false); onMobileClose?.(); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"><svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg><span>{isAdmin ? t('adminPanel') : t('dashboard')}</span></Link> : null}
              <Link href="/settings" onClick={() => { setUserOpen(false); onMobileClose?.(); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"><svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span>{t('settings')}</span></Link>
            </div>
            <div className="border-t border-zinc-100 pt-1">
              <button type="button" onClick={() => { setUserOpen(false); logout(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>{t('signOut')}</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Mobile Drawer ─────────────────────────────────────────

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAuthenticated, user, isAdmin, isAgent, logout } = useAuth();
  const t = useTranslations('Nav');
  const tc = useTranslations('Common');
  const pathname = usePathname();
  const drawerNavItems = [
    { href: '/flights', label: t('flights') },
    { href: '/hotels', label: t('hotels') },
  ];
  const reducedMotion = useReducedMotion();

  return (
    <>
      <AnimatePresence>{open ? <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden" /> : null}</AnimatePresence>
      <AnimatePresence>
        {open ? (
          <motion.div initial={reducedMotion ? false : { x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.3, ease }} className="fixed inset-y-0 right-0 z-50 w-72 max-w-[82vw] bg-white shadow-2xl md:hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <Link href="/" onClick={onClose} className="flex items-center gap-2.5"><Logo size="sm" withLink={false} /></Link>
              <button onClick={onClose} aria-label={tc('closeMenu')} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {drawerNavItems.map(item => (
                <Link key={item.href} href={item.href} onClick={onClose} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${pathname?.startsWith(item.href) ? 'bg-brand-teal/8 text-brand-teal' : 'text-zinc-700 hover:bg-zinc-50'}`}>{item.label}</Link>
              ))}
              {isAuthenticated ? <Link href="/bookings" onClick={onClose} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">{t('myBookings')}</Link> : null}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 shrink-0"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">{t('currency')}</span><div className="mt-2"><CurrencySelector /></div></div>
            <div className="p-4 border-t border-zinc-100 shrink-0">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-1 mb-3"><UserAvatar initial={(user?.firstName ?? user?.email ?? '?').charAt(0).toUpperCase()} large avatarUrl={user?.avatarUrl} /><div><p className="text-sm font-bold text-zinc-900">{user?.firstName ?? user?.email}</p><p className="text-[11px] text-zinc-500">{isAdmin ? t('adminShort') : isAgent ? t('agentShort') : t('userCustomer')}</p></div></div>
                  {(isAdmin || isAgent) ? <Link href={isAdmin ? '/admin' : '/agent'} onClick={onClose} className="flex items-center justify-center rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">{isAdmin ? t('adminPanel') : t('dashboard')}</Link> : null}
                  <button type="button" onClick={() => { onClose(); logout(); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] py-3 text-sm font-bold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/30 transition-all duration-200 active:scale-[0.98]"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>{t('signOut')}</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/signin" onClick={onClose} className="flex items-center justify-center rounded-xl border-2 border-brand-teal/20 py-3 text-sm font-bold text-brand-teal hover:border-brand-teal/40 hover:bg-brand-teal/[0.04] transition-all duration-200 active:scale-[0.98]">{t('signIn')}</Link>
                    <Link href="/signup" onClick={onClose} className="flex items-center justify-center rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] py-3 text-sm font-bold text-white shadow-lg shadow-brand-teal/20 hover:shadow-brand-teal/30 transition-all duration-200 active:scale-[0.98]">{t('signUp')}</Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/signup?role=customer" onClick={onClose} className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 py-3 text-center hover:bg-zinc-50 transition-colors"><span className="text-xs font-bold text-zinc-700">{t('userCustomer')}</span><span className="text-[10px] text-zinc-500">{t('forTravelers')}</span></Link>
                    <Link href="/signup?role=agent" onClick={onClose} className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 py-3 text-center hover:bg-zinc-50 transition-colors"><span className="text-xs font-bold text-zinc-700">{t('userAgent')}</span><span className="text-[10px] text-zinc-500">{t('forAgencies')}</span></Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// ─── Main Header ───────────────────────────────────────────

export function MainHeader({ variant = 'auto' }: { variant?: 'auto' | 'solid' }) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const t = useTranslations('Nav');
  const tc = useTranslations('Common');
  const navItems = [
    { href: '/flights', label: t('flights') },
    { href: '/hotels', label: t('hotels') },
  ];
  const useAutoColor = variant === 'auto' && isHome;
  const [scrolled, setScrolled] = useState(!useAutoColor);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Sync scrolled state when useAutoColor changes (e.g. navigating between pages)
  useEffect(() => {
    if (!useAutoColor) {
      setScrolled(true);
      return;
    }
    // On home page: sync with current scroll position
    setScrolled(window.scrollY > 20);
  }, [useAutoColor]);

  useEffect(() => {
    if (!useAutoColor) return;
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [useAutoColor]);

  function isActive(href: string) { return pathname === href || pathname?.startsWith(`${href}/`); }

  const headerBg = scrolled
    ? 'bg-white/90 border-zinc-200/60 shadow-[0_1px_0_rgba(0,0,0,0.03),0_4px_24px_rgba(3,61,74,0.06)]'
    : 'bg-transparent border-transparent';
  const navBase = scrolled ? 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/4' : 'text-white/80 hover:text-white hover:bg-white/10';
  const navActive = scrolled ? 'bg-brand-teal/8 text-brand-teal font-bold' : 'bg-white/15 text-white font-bold';
  const mobileBtn = scrolled ? 'text-zinc-600 hover:bg-zinc-100' : 'text-white hover:bg-white/10';

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,box-shadow,border-color] duration-150 ${headerBg}`}>
        <div className="mx-auto flex h-16 md:h-20 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logo — wordmark flips white over the hero, dark once scrolled */}
          <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-xl">
            <Logo size="md" onDark={!scrolled} withLink={false} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className={`relative rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  active
                    ? scrolled ? 'text-brand-teal' : 'text-white'
                    : scrolled ? 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/[0.04]' : 'text-white/80 hover:text-white hover:bg-white/8'
                }`}>
                  {item.label}
                  {/* Active pill */}
                  {active ? <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-xl bg-brand-teal/10 -z-10" transition={{ type: 'spring', stiffness: 400, damping: 30 }} /> : null}
                  {/* Hover underline for inactive */}
                  {!active ? <span className="absolute bottom-1 left-1/2 h-0.5 w-0 rounded-full bg-brand-teal transition-all duration-300 group-hover:left-[20%] group-hover:w-[60%] -translate-x-1/2" /> : null}
                </Link>
              );
            })}
          </nav>

          {/* Right */}
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <LanguageSelector />
            <CurrencySelector />
            <AuthArea scrolled={scrolled} onMobileClose={closeMobile} />
          </div>

          {/* Mobile toggle */}
          <button type="button" onClick={() => setMobileOpen(o => !o)} className={`ml-auto md:hidden flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${mobileBtn}`} aria-label={tc('toggleMenu')}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
        </div>
      </header>
      <MobileDrawer open={mobileOpen} onClose={closeMobile} />
    </>
  );
}
