import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/format';
import type { BlogPostSummary } from '../types';

export async function FeaturedPost({ post }: { post: BlogPostSummary }) {
  const tCommon = await getTranslations('Common');
  const author = post.author?.firstName
    ? `${post.author.firstName} ${post.author.lastName ?? ''}`.trim()
    : 'TravelsOTA';
  // ponytail: minutes computed inline — estimateReadingTime helper stays English-only, not wired here
  const readMinutes = Math.max(1, Math.round((post.title + ' ' + (post.excerpt ?? '')).split(/\s+/).filter(Boolean).length / 200));

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(3,61,74,0.06)] transition-[box-shadow,border-color] duration-300 hover:border-brand-teal/25 hover:shadow-[0_24px_60px_-20px_rgba(3,61,74,0.25)]">
      <div className="grid lg:grid-cols-2">
        <Link
          href={`/blog/${post.slug}`}
          className="relative block aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[420px]"
        >
          {post.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImageUrl}
              alt={post.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-teal-50 to-brand-teal-100" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
          <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-brand-teal px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-brand-teal/30">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {tCommon('blogFeatured')}
          </span>
        </Link>

        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">
            {post.category?.name ?? tCommon('blogKicker')}
          </span>
          <h2 className="mt-4 text-balance text-2xl font-bold leading-tight tracking-tight text-charcoal sm:text-3xl">
            <Link href={`/blog/${post.slug}`} className="transition-colors duration-200 hover:text-brand-teal">
              {post.title}
            </Link>
          </h2>
          {post.excerpt ? (
            <p className="mt-4 text-base leading-relaxed text-[#7d7d7d]">{post.excerpt}</p>
          ) : null}

          <div className="mt-6 flex items-center gap-3 text-sm text-[#9ca3af]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-teal-600 text-xs font-bold text-white">
              {author.charAt(0).toUpperCase()}
            </span>
            <span className="font-medium text-zinc-600">{author}</span>
            <span className="text-zinc-300">·</span>
            <span className="tabular-nums">{post.publishedAt ? formatDate(post.publishedAt) : ''}</span>
            <span className="text-zinc-300">·</span>
            <span>{tCommon('blogMinRead', { count: readMinutes })}</span>
          </div>

          <Link
            href={`/blog/${post.slug}`}
            className="group/cta mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-brand-teal px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_rgba(3,61,74,0.4)] transition-all duration-300 hover:bg-brand-teal-600 hover:shadow-[0_12px_28px_-6px_rgba(3,61,74,0.5)]"
          >
            {tCommon('blogReadStory')}
            <svg className="h-4 w-4 transition-transform duration-300 group-hover/cta:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
