import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getBlogPost } from '@/features/blog/api/server';
import { formatDate } from '@/lib/format';
import { PostCard } from '@/features/blog/components/post-card';
import { ContentShell } from '@/components/layout/ContentShell';
import { ShareButtons } from '@/features/blog/components/share-buttons';
import { ReadingProgress } from '@/features/blog/components/reading-progress';
import { TableOfContents } from '@/features/blog/components/table-of-contents';
import { BlogArticle } from '@/features/blog/components/blog-article';
import { slugifyHeading, uniqueHeadingIds } from '@/features/blog/lib/slugify-heading';

export const revalidate = 60;

type PageProps = { params: Promise<{ slug: string }> };

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travelsota.com';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let post;
  try { post = await getBlogPost(slug); } catch { return {}; }
  return {
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    keywords: post.metaKeywords ?? undefined,
    openGraph: { title: post.title, description: post.metaDescription ?? post.excerpt ?? undefined, type: 'article', publishedTime: post.publishedAt ?? undefined, images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined },
    robots: post.noindex ? { index: false, follow: false } : undefined,
    alternates: { canonical: post.canonicalUrl ?? `/blog/${post.slug}` },
  };
}

function extractHeadings(html: string): { id: string; text: string }[] {
  const headingRegex = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  const raw = Array.from(html.matchAll(headingRegex)).map((m) => ({
    id: slugifyHeading(m[2]),
    text: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
  return uniqueHeadingIds(raw);
}

function readingMinutes(html: string): number {
  const w = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
  return Math.max(1, Math.round(w / 200));
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  let post;
  try { post = await getBlogPost(slug); } catch { notFound(); }
  if (!post) notFound();
  const tCommon = await getTranslations('Common');
  const tCheckout = await getTranslations('Checkout');

  const authorName = post.author?.firstName ? `${post.author.firstName} ${post.author.lastName ?? ''}`.trim() : 'TravelsOTA Team';
  const url = `${siteUrl}/blog/${post.slug}`;
  const headings = extractHeadings(post.bodyHtml);

  return (
    <div className="overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt ?? undefined, image: post.coverImageUrl ?? undefined, datePublished: post.publishedAt ?? undefined, url, author: post.author ? { '@type': 'Person', name: authorName } : { '@type': 'Organization', name: 'TravelsOTA' } }) }} />
      <ReadingProgress />

      <ContentShell width="wide" className="pt-10 sm:pt-16">
      <header className="mx-auto max-w-[820px]">
        <Link href={post.category ? `/blog?category=${post.category.slug}` : '/blog'} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-brand-teal">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>{tCommon('blogBackToJournal')}
        </Link>
        {post.category ? <Link href={`/blog?category=${post.category.slug}`} className="mt-8 inline-block rounded-full bg-brand-teal px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(3,61,74,0.5)]">{post.category.name}</Link> : null}
        <h1 className="mt-5 text-balance text-3xl font-bold leading-[1.15] tracking-tight text-charcoal sm:text-5xl">{post.title}</h1>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-teal-600 text-sm font-bold text-white">{authorName.charAt(0).toUpperCase()}</span>
            <div className="leading-tight"><p className="font-semibold text-zinc-700">{authorName}</p><p className="mt-0.5 text-xs tabular-nums">{post.publishedAt ? formatDate(post.publishedAt) : ''}<span className="mx-1.5 text-zinc-300">·</span>{tCommon('blogMinRead', { count: readingMinutes(post.bodyHtml) })}{post.viewCount > 0 ? <><span className="mx-1.5 text-zinc-300">·</span>{tCommon('blogViews', { count: post.viewCount })}</> : null}</p></div>
          </div>
          <ShareButtons title={post.title} url={url} />
        </div>
      </header>
      </ContentShell>

      {post.coverImageUrl ? <ContentShell width="wide" className="pt-10"><div className="overflow-hidden rounded-3xl shadow-[0_24px_60px_-20px_rgba(3,61,74,0.35)]">{ }<img src={post.coverImageUrl} alt={post.title} loading="eager" className="h-auto w-full object-cover" /></div></ContentShell> : null}

      <ContentShell width="wide" className="pt-12">
      {/* Mobile TOC disclosure */}
      {headings.length > 1 ? (
        <details className="mb-8 rounded-2xl border border-zinc-200 bg-white lg:hidden">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-zinc-600 select-none">
            {tCommon('blogTocTitle')}
          </summary>
          <div className="border-t border-zinc-100 px-5 py-3">
            <TableOfContents headings={headings} />
          </div>
        </details>
      ) : null}

      <article className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
        <div className="min-w-0 max-w-[var(--content-reading,68ch)] lg:max-w-none"><BlogArticle bodyHtml={post.bodyHtml} /></div>
        {headings.length > 1 ? <aside className="hidden lg:block"><div className="sticky top-24"><TableOfContents headings={headings} /></div></aside> : null}
      </article>
      </ContentShell>

      <ContentShell width="standard" className="pb-8 pt-10">
        {post.metaKeywords ? <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-8">{post.metaKeywords.split(',').map(kw => <span key={kw} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">#{kw.trim().replace(/\s+/g, '-')}</span>)}</div> : null}
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50/70 px-6 py-5"><p className="text-sm font-medium text-zinc-700">{tCommon('blogEnjoyedStory')}</p><ShareButtons title={post.title} url={url} /></div>

        {(post.prev || post.next) ? <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {post.prev ? <Link href={`/blog/${post.prev.slug}`} className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-teal/30 hover:shadow-md"><svg className="h-5 w-5 shrink-0 text-zinc-400 transition-colors group-hover:text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg><div className="min-w-0"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">{tCommon('previousPage')}</span><p className="mt-0.5 line-clamp-2 text-sm font-medium text-zinc-700 group-hover:text-brand-teal">{post.prev.title}</p></div></Link> : null}
          {post.next ? <Link href={`/blog/${post.next.slug}`} className={`group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-teal/30 hover:shadow-md ${!post.prev ? 'ml-auto' : ''}`}><div className="min-w-0 ml-auto text-right"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">{tCommon('nextPage')}</span><p className="mt-0.5 line-clamp-2 text-sm font-medium text-zinc-700 group-hover:text-brand-teal">{post.next.title}</p></div><svg className="h-5 w-5 shrink-0 text-zinc-400 transition-colors group-hover:text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></Link> : null}
        </div> : null}
      </ContentShell>

      {post.related.length > 0 ? <section className="border-t border-zinc-100 bg-gradient-to-b from-white to-brand-teal/5"><ContentShell width="wide" className="py-16"><div className="mb-8 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{tCommon('blogKeepReading')}</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">{tCommon('blogRelatedStories')}</h2></div><Link href="/blog" className="hidden text-sm font-medium text-brand-teal transition-colors hover:text-brand-teal-600 sm:inline">{tCommon('blogViewAllArrow')}</Link></div><div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{post.related.map(r => <PostCard key={r.id} post={r} variant="standard" />)}</div></ContentShell></section> : null}

      <ContentShell width="wide" className="pb-24"><div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-teal via-brand-teal-600 to-brand-teal-800 px-8 py-14 text-center sm:px-16"><div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" /><div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" /><p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-teal-200">{tCommon('blogCtaKicker')}</p><h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">{tCommon('blogCtaPostTitle')}</h2><div className="mt-9 flex flex-wrap items-center justify-center gap-3"><Link href="/flights" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-brand-teal shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">{tCheckout('searchFlights')} <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" /></svg></Link><Link href="/hotels" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white hover:bg-white/10">{tCommon('blogFindHotels')}</Link></div></div></ContentShell>
    </div>
  );
}
