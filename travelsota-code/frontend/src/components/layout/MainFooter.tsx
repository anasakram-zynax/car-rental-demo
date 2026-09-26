'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCmsFooter } from '@/features/cms/hooks';
import { useSiteSettings } from '@/features/admin/hooks/use-site-settings';
import { usePublicModules } from '@/features/home/hooks/usePublicModules';
import { SOCIAL_ICON_MAP } from '@/components/common/SocialIcons';
import { Logo } from '@/components/common/Logo';

const easeOut = [0.16, 1, 0.3, 1] as const;

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const itemVariants = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } };

interface FooterColumn {
  id: string;
  title: string;
  links: { label: string; href: string }[];
}

type NavT = ReturnType<typeof useTranslations<'Nav'>>;
type FooterT = ReturnType<typeof useTranslations<'Footer'>>;

function getDefaultColumns(tNav: NavT, tFooter: FooterT): FooterColumn[] {
  return [
    {
      id: 'footer-default-explore',
      title: tFooter('explore'),
      links: [
        { label: tFooter('home'), href: '/' },
        { label: tNav('flights'), href: '/flights/search' },
        { label: tNav('hotels'), href: '/hotels/search' },
        { label: tNav('blog'), href: '/blog' },
      ],
    },
    {
      id: 'footer-default-support',
      title: tFooter('support'),
      links: [
        { label: tNav('myBookings'), href: '/my-bookings' },
        { label: tNav('signIn'), href: '/signin' },
        { label: tFooter('createAccount'), href: '/signup' },
      ],
    },
  ];
}

// Shown when the admin hasn't configured Contact & Social yet, so the footer
// never renders an empty column.
const DEFAULT_CONTACT = {
  email: 'support@travelsota.com',
  phone: '+92 21 111 505 505',
  whatsapp: '+92 300 111 5055',
  location: 'Suite 402, Business Bay Tower, Trade Centre Road, Karachi, Pakistan',
};

const DEFAULT_SOCIALS: { platform: string; url: string }[] = [
  { platform: 'facebook', url: '#' },
  { platform: 'instagram', url: '#' },
  { platform: 'twitter', url: '#' },
  { platform: 'linkedin', url: '#' },
  { platform: 'youtube', url: '#' },
];

function FooterLink({ label, href }: { label: string; href: string }) {
  return (
    <motion.li variants={itemVariants}>
      <Link
        href={href}
        prefetch={false}
        className="group relative inline-flex items-center gap-2 text-sm text-white/60 transition-colors duration-300 hover:text-white"
      >
        <span className="h-px w-0 bg-brand-teal/70 transition-all duration-300 group-hover:w-3" aria-hidden />
        <span className="relative transition-transform duration-300 group-hover:translate-x-0.5">
          {label}
          <span className="absolute -bottom-px left-0 h-px w-0 bg-brand-teal/60 transition-all duration-300 group-hover:w-full" />
        </span>
      </Link>
    </motion.li>
  );
}

function ContactItem({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  href?: string;
}) {
  if (!value || !value.trim()) return null;
  const displayValue = value.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-brand-teal-300 transition-colors duration-300 group-hover:border-brand-teal/40 group-hover:bg-brand-teal/10">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</span>
        {/* break-words + line-clamp-3: long addresses wrap instead of blowing out the column */}
        <span className="mt-0.5 block break-words text-sm leading-relaxed text-white/80 transition-colors duration-300 group-hover:text-white line-clamp-3">
          {displayValue}
        </span>
      </span>
    </>
  );
  const cls = 'group flex items-start gap-3 text-left';
  return (
    <motion.li variants={itemVariants}>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} className={cls}>
          {inner}
        </a>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </motion.li>
  );
}

export function MainFooter() {
  const reducedMotion = useReducedMotion();
  const tNav = useTranslations('Nav');
  const tFooter = useTranslations('Footer');
  const { data: footerData } = useCmsFooter();
  const { data: settings } = useSiteSettings();
  const { modules: publicModules } = usePublicModules();

  // CMS categories (max 2 per the design); fall back to curated defaults when the admin hasn't created any yet.
  const cmsColumns: FooterColumn[] = (footerData ?? [])
    .slice(0, 2)
    .map((cat) => ({
      id: `footer-cat-${cat.id}`,
      title: cat.name,
      links: cat.menus
        .filter((m) => m.url)
        .map((m) => {
          let href = m.url as string;
          const clean = href.trim();
          const lower = m.label.trim().toLowerCase();
          if (clean === '/booking' || clean === '/bookings' || lower === 'my bookings' || lower === 'my booking') {
            href = '/my-bookings';
          }
          return { label: m.label, href };
        }),
    }))
    .filter((col) => col.links.length > 0);

  const columns = ((cmsColumns.length > 0 ? cmsColumns : getDefaultColumns(tNav, tFooter)) as FooterColumn[])
    .map((col) => ({
      ...col,
      links: col.links
        .filter((l) => (publicModules
          ? l.href.includes('/flights') ? publicModules.flights.enabled
            : l.href.includes('/hotels') ? publicModules.hotels.enabled
            : true
          : true))
        .map((l) => ({
          ...l,
          label: publicModules
            ? l.href.includes('/flights') ? (publicModules.flights.name || l.label)
              : l.href.includes('/hotels') ? (publicModules.hotels.name || l.label)
              : l.label
            : l.label,
        })),
    }))
    .filter((col) => col.links.length > 0);

  // Defaults kick in only when the admin hasn't set a value — never empty.
  const email = settings?.email?.trim() || DEFAULT_CONTACT.email;
  const phone = settings?.phone?.trim() || DEFAULT_CONTACT.phone;
  const whatsapp = settings?.whatsapp?.trim() || DEFAULT_CONTACT.whatsapp;
  const location = settings?.location?.trim() || DEFAULT_CONTACT.location;

  const configuredSocials = (settings?.socialLinks ?? []).filter((s) => s.url.trim() && SOCIAL_ICON_MAP[s.platform]);
  const socialLinks = configuredSocials.length > 0 ? configuredSocials : DEFAULT_SOCIALS;

  const contactItems = [
    {
      key: 'email',
      icon: <Mail className="h-4 w-4" />,
      label: tFooter('email'),
      value: email,
      href: `mailto:${email}`,
    },
    {
      key: 'phone',
      icon: <Phone className="h-4 w-4" />,
      label: tFooter('phone'),
      value: phone,
      href: `tel:${phone.replace(/[\s\-()]/g, '')}`,
    },
    {
      key: 'whatsapp',
      icon: <MessageCircle className="h-4 w-4" />,
      label: tFooter('whatsapp'),
      value: whatsapp,
      href: `https://wa.me/${whatsapp.replace(/[\s\-()\+]/g, '')}`,
    },
    {
      key: 'location',
      icon: <MapPin className="h-4 w-4" />,
      label: tFooter('address'),
      value: location,
    },
  ];

  const content = (
    <div className="relative z-10 mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-14">
      <div
        className="grid gap-10 md:grid-cols-2 lg:gap-8 lg:[grid-template-columns:1.5fr_repeat(var(--footer-cols),1fr)_1.25fr]"
        style={{ ['--footer-cols' as string]: columns.length }}
      >
        {/* Brand — description, socials, blog */}
        <div className="min-w-0 max-w-sm">
          <Logo size="lg" onDark />
          <p className="mt-4 text-pretty text-sm leading-relaxed text-white/50">
            {settings?.tagline || 'Flights, hotels, and more for customers, agents and travel teams. Smart booking, global reach, one platform.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {socialLinks.map((s) => (
              <motion.a
                key={s.platform}
                href={s.url}
                target={s.url.startsWith('http') ? '_blank' : undefined}
                rel={s.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                aria-label={s.platform}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors duration-300 hover:border-brand-teal/40 hover:text-brand-teal"
                whileHover={{ scale: 1.1, y: -1 }}
                whileTap={{ scale: 0.95 }}
              >
                {SOCIAL_ICON_MAP[s.platform]}
              </motion.a>
            ))}
          </div>
          <Link
            href="/blog"
            className="group mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-medium text-brand-teal-300 transition-all duration-300 hover:border-brand-teal/40 hover:bg-brand-teal/10 hover:text-brand-teal-200"
          >
            {tFooter('travelBlog')}
            <svg className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>

        {/* Menu columns (max 2 from CMS categories) */}
        {columns.map((group) => (
          <div key={group.id} className="min-w-0">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
              {group.title}
              <span className="h-px w-4 bg-brand-teal/40" aria-hidden />
            </h3>
            <ul className="mt-5 space-y-3">
              {group.links.map((link) => (
                <FooterLink key={link.label} label={link.label} href={link.href} />
              ))}
            </ul>
          </div>
        ))}

        {/* Contact */}
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            {tFooter('contactUs')}
            <span className="h-px w-4 bg-brand-teal/40" aria-hidden />
          </h3>
          <ul className="mt-5 space-y-4">
            {contactItems.map((c) => (
              <ContactItem key={c.key} icon={c.icon} label={c.label} value={c.value} href={c.href} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const bottomBar = (
    <div className="relative z-10 border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-5 sm:flex-row sm:px-8">
        {/* Copyright — left side */}
        <p className="text-xs text-white">
          &copy; {new Date().getFullYear()} {settings?.siteName || 'Travels OTA'}. {tFooter('allRightsReserved')}.
        </p>

        {/* Credit line — right side (animated emojis, brand palette) */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
          <span className="text-white">Built with</span>
          <motion.span
            className="inline-block text-base leading-none drop-shadow-[0_0_6px_rgba(51,191,168,0.35)]"
            aria-hidden
            animate={reducedMotion ? undefined : { scale: [1, 1.3, 1] }}
            transition={reducedMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          >
            ❤️
          </motion.span>
          <span className="text-white">by</span>
          <a
            href="https://travelsota.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-teal-200 transition-colors duration-200 hover:text-brand-teal-400 hover:underline underline-offset-4"
          >
            Travels OTA
          </a>
          <span className="text-white/70">—</span>
          <span className="text-white">Vibing Worldwide</span>
          <motion.span
            className="inline-block text-base leading-none"
            aria-hidden
            animate={reducedMotion ? undefined : { rotate: [0, 360] }}
            transition={reducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            🌎
          </motion.span>
          <motion.span
            className="inline-block text-base leading-none"
            aria-hidden
            animate={reducedMotion ? undefined : { y: [0, -4, 0] }}
            transition={reducedMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            ⚡
          </motion.span>
        </div>
      </div>
    </div>
  );

  return (
    <footer className="relative overflow-hidden bg-[#0a1218]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-teal/30 to-transparent" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-teal/5 blur-[90px]" aria-hidden />
      {reducedMotion ? (
        <>
          {content}
          {bottomBar}
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[600px] -translate-x-1/2 rounded-full bg-brand-teal/4 blur-[100px]" />
          <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-120px' }}>
            {content}
          </motion.div>
          {bottomBar}
        </>
      )}
    </footer>
  );
}
