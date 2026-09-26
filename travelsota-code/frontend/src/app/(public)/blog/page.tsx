import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getBlogCategories, getBlogPosts } from '@/features/blog/api/server';
import { PostCard } from '@/features/blog/components/post-card';
import { FeaturedPost } from '@/features/blog/components/featured-post';
import { BlogSearchSort } from '@/features/blog/components/blog-search-sort';
import { ContentShell } from '@/components/layout/ContentShell';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Travel Blog | TravelsOTA',
  description: 'Travel tips, destination guides, and booking advice for flights and hotels worldwide from the TravelsOTA team.',
};

function pageLinks(current: number, totalPages: number, category: string | undefined, sort: string | undefined, q: string | undefined) {
  const to = (page: number) => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (sort) p.set('sort', sort);
    if (q) p.set('q', q);
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    return `/blog${qs ? `?${qs}` : ''}`;
  };
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
  else {
    pages.push(1); if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) pages.push(i);
    if (current < totalPages - 2) pages.push('...'); pages.push(totalPages);
  }
  return { to, pages };
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ page?: string; category?: string; q?: string; sort?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const category = sp.category;
  const q = sp.q;
  const sort = sp.sort;

  let posts, categories;
  let failed = false;
  try {
    [posts, categories] = await Promise.all([
      getBlogPosts({ categorySlug: category, q, page, limit: 9, sort }),
      getBlogCategories(),
    ]);
  } catch { failed = true; }

  const totalPosts = categories?.reduce((s, c) => s + c.postCount, 0) ?? 0;
  const featured = page === 1 && !q && !category ? posts?.data.find(p => p.isFeatured) : undefined;
  const gridPosts = featured ? (posts?.data ?? []).filter(p => p.id !== featured.id) : (posts?.data ?? []);
  const { to, pages } = pageLinks(page, posts?.totalPages ?? 1, category, sort, q);

  const tCommon = await getTranslations('Common');
  const tCheckout = await getTranslations('Checkout');

  const sortOptions = [
    { value: '', label: tCommon('blogSortNewest') },
    { value: 'oldest', label: tCommon('blogSortOldest') },
    { value: 'popular', label: tCommon('blogSortPopular') },
  ];

  const persistFilter = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const vals = { category, sort, q, ...overrides };
    if (vals.category) p.set('category', vals.category);
    if (vals.sort) p.set('sort', vals.sort);
    if (vals.q) p.set('q', vals.q);
    const qs = p.toString();
    return `/blog${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="overflow-hidden">
      {/* ── Editorial hero ─────────────────────────────────── */}
      <section className="relative">
        <div className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-brand-teal-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -right-28 top-16 h-80 w-80 rounded-full bg-brand-teal-50 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-teal/30 to-transparent" />
        <ContentShell width="wide" className="pb-14 pt-16 sm:pt-24">
          <p className="inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-brand-teal">
            <span className="h-px w-8 bg-brand-teal/50" />{tCommon('blogKicker')}
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-charcoal sm:text-6xl">
            {tCommon('blogHeroTitleA')}<br /><span className="text-brand-teal">{tCommon('blogHeroTitleB')}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#7d7d7d]">
            {tCommon('blogHeroDesc')}
          </p>

          {/* ── Search + Sort bar ──────────────────────────── */}
          <BlogSearchSort category={category} sort={sort} q={q} sortOptions={sortOptions} />

          {/* ── Active filter summary ──────────────────────────── */}
          {(q || (category && category !== '') || (sort && sort !== '' && sort !== 'newest')) ? (
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{tCommon('filters')}</span>
              {q ? (
                <Link href={persistFilter({ q: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal transition-colors hover:bg-brand-teal/20">
                  &ldquo;{q}&rdquo; <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </Link>
              ) : null}
              {category ? (
                <Link href={persistFilter({ category: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal transition-colors hover:bg-brand-teal/20">
                  {categories?.find(c => c.slug === category)?.name ?? category} <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </Link>
              ) : null}
              {sort && sort !== 'newest' ? (
                <Link href={persistFilter({ sort: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal transition-colors hover:bg-brand-teal/20">
                  {sortOptions.find(o => o.value === sort)?.label ?? sort} <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </Link>
              ) : null}
              <Link href="/blog" className="text-xs font-medium text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-600">{tCommon('blogClearAll')}</Link>
            </div>
          ) : null}

          {/* ── Category pills ─────────────────────────────── */}
          <div className="mt-5 flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <Link href={persistFilter({ category: undefined })} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${!category ? 'bg-brand-teal text-white shadow-[0_6px_16px_-6px_rgba(3,61,74,0.5)]' : 'border border-zinc-200 bg-white/80 text-zinc-600 backdrop-blur-sm hover:-translate-y-0.5 hover:border-brand-teal/40 hover:text-brand-teal'}`}>
              {tCommon('blogAllStories')} <span className="text-xs opacity-70">{totalPosts}</span>
            </Link>
            {categories?.map(cat => (
              <Link key={cat.id} href={persistFilter({ category: cat.slug })} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${category === cat.slug ? 'bg-brand-teal text-white shadow-[0_6px_16px_-6px_rgba(3,61,74,0.5)]' : 'border border-zinc-200 bg-white/80 text-zinc-600 backdrop-blur-sm hover:-translate-y-0.5 hover:border-brand-teal/40 hover:text-brand-teal'}`}>
                {cat.name} <span className="text-xs opacity-70">{cat.postCount}</span>
              </Link>
            ))}
          </div>
        </ContentShell>
      </section>

      {/* ── Content ───────────────────────────────────────── */}
      <ContentShell width="wide" className="pb-20">
        {failed ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-16 text-center shadow-sm"><p className="text-sm text-[#7d7d7d]">{tCommon('blogUnavailable')}</p><Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-teal hover:underline">{tCommon('blogBackHome')}</Link></div>
        ) : !posts || posts.data.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-16 text-center shadow-sm">
            <p className="text-sm text-[#7d7d7d]">{q ? tCommon('blogNoResults', { q }) : category ? tCommon('blogNoCategoryStories') : tCommon('blogNoStories')}</p>
            <Link href="/blog" className="mt-4 inline-block text-sm font-medium text-brand-teal hover:underline">{q || category ? tCommon('blogClearFilters') : tCommon('blogBackHome')}</Link>
          </div>
        ) : (
          <>
            {featured ? <div className="stagger-in"><FeaturedPost post={featured} /></div> : null}

            {gridPosts.length > 0 ? (
              <>
                {featured ? (
                  <div className="mb-8 mt-16 flex items-end justify-between">
                    <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{tCommon('blogMoreFromJournal')}</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">{tCommon('blogKeepExploring')}</h2></div>
                    {category ? <Link href={persistFilter({ category: undefined })} className="hidden text-sm font-medium text-brand-teal transition-colors hover:text-brand-teal-600 sm:inline">{tCommon('blogClearFilterArrow')}</Link> : null}
                  </div>
                ) : (
                  <div className="mb-8 mt-8 flex items-end justify-between">
                    <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{q ? tCommon('blogResultsFor', { q }) : tCommon('blogLatestStories')}</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">{q ? tCommon('blogResultCount', { total: posts.total }) : ''}</h2></div>
                    {category || q ? <Link href="/blog" className="hidden text-sm font-medium text-brand-teal transition-colors hover:text-brand-teal-600 sm:inline">{tCommon('blogClearFiltersArrow')}</Link> : null}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {gridPosts.map(p => <PostCard key={p.id} post={p} />)}
                </div>
              </>
            ) : null}

            {posts && posts.totalPages > 1 && posts.total > posts.limit ? (
              <nav className="mt-14 flex items-center justify-center gap-2">
                {page > 1 ? <Link href={to(page - 1)} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-teal/40 hover:text-brand-teal"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7"/></svg><span className="hidden sm:inline">{tCommon('previousPage')}</span></Link> : null}
                <div className="flex items-center gap-1.5">
                  {pages.map((p, i) => p === '...' ? <span key={`e-${i}`} className="flex h-11 w-11 items-center justify-center text-sm text-zinc-400">…</span>
                    : <Link key={p} href={to(p)} aria-current={p === page ? 'page' : undefined} className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 ${p === page ? 'bg-brand-teal text-white shadow-[0_8px_20px_-6px_rgba(3,61,74,0.5)]' : 'border border-zinc-200 bg-white text-zinc-600 hover:-translate-y-0.5 hover:border-brand-teal/40 hover:text-brand-teal'}`}>{p}</Link>)}
                </div>
                {page < posts.totalPages ? <Link href={to(page + 1)} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-teal/40 hover:text-brand-teal"><span className="hidden sm:inline">{tCommon('nextPage')}</span><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7"/></svg></Link> : null}
              </nav>
            ) : null}
          </>
        )}
      </ContentShell>

      {/* ── CTA band ──────────────────────────────────────── */}
      <ContentShell width="wide" className="pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-teal via-brand-teal-600 to-brand-teal-800 px-8 py-14 text-center sm:px-16">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-teal-200">{tCommon('blogCtaKicker')}</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">{tCommon('blogCtaTitle')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brand-teal-100">{tCommon('blogCtaDesc')}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/flights" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-brand-teal shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">{tCheckout('searchFlights')} <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3"/></svg></Link>
            <Link href="/hotels" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white hover:bg-white/10">{tCommon('blogFindHotels')}</Link>
          </div>
        </div>
      </ContentShell>
    </div>
  );
}
