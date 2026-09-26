import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCmsPage } from '@/features/cms/api/server';
import { ContentShell } from '@/components/layout/ContentShell';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travelsota.com';

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await searchParams;
  let page;
  try {
    page = await getCmsPage(slug, lang);
  } catch {
    return {};
  }

  const metadata: Metadata = {
    title: page.seoTitle ?? page.name,
    description: page.seoDescription ?? page.description ?? undefined,
    keywords: page.seoKeywords ?? undefined,
  };

  if (page.noindex) {
    metadata.robots = { index: false, follow: false };
  }
  if (page.canonicalUrl) {
    metadata.alternates = { canonical: page.canonicalUrl };
  } else {
    metadata.alternates = { canonical: `/page/${page.slug}` };
  }

  return metadata;
}

// Language switcher for CMS pages with translated name and content support.
const SUPPORTED_LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zh', label: '中文' },
  { code: 'tr', label: 'Türkçe' },
];

export default async function CmsPageRoute({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { lang } = await searchParams;

  let page;
  try {
    page = await getCmsPage(slug, lang);
  } catch {
    notFound();
  }
  if (!page) notFound();
  const tCheckout = await getTranslations('Checkout');
  const tCommon = await getTranslations('Common');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.name,
    description: page.description ?? undefined,
    url: `${siteUrl}/page/${page.slug}`,
  };

  const isRtl = (lang || 'en') === 'ar';

  return (
    <ContentShell width="standard" className="py-8 sm:py-12 lg:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-6 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/" className="transition-colors hover:text-brand-teal">{tCheckout('homeAction')}</Link>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-zinc-600 font-medium">{page.name}</span>
      </nav>

      {/* Language switcher */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {SUPPORTED_LANGS.map((l) => {
          const isActive = l.code === (lang || 'en');
          return (
            <Link
              key={l.code}
              href={`/page/${slug}${l.code !== 'en' ? `?lang=${l.code}` : ''}`}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand-teal text-white'
                  : 'border border-zinc-200 text-zinc-500 hover:border-brand-teal/30 hover:text-brand-teal'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>

      <div dir={isRtl ? 'rtl' : 'ltr'}>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-charcoal sm:text-5xl">
          {page.name}
        </h1>

        {page.description ? (
          <p className="mt-5 text-lg leading-relaxed text-[#7d7d7d]">{page.description}</p>
        ) : null}

        {page.content ? (
          <div className="blog-body mt-10" dangerouslySetInnerHTML={{ __html: page.content }} />
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-10 text-center">
            <p className="text-sm text-[#9ca3af]">{tCommon('cmsEmptyContent')}</p>
            <Link href="/" className="mt-3 inline-block text-sm font-medium text-brand-teal hover:underline">{tCommon('blogBackHome')}</Link>
          </div>
        )}
      </div>
    </ContentShell>
  );
}
