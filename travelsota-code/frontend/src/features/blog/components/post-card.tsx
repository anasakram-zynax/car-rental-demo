import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/format';
import type { BlogPostSummary } from '../types';

type CardVariant = 'standard' | 'popular' | 'compact';

function authorName(post: BlogPostSummary): string {
  if (!post.author?.firstName) return 'TravelsOTA';
  return `${post.author.firstName} ${post.author.lastName ?? ''}`.trim();
}

function AuthorMark({ name, compact }: { name: string; compact?: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  if (compact) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-teal-600 text-[9px] font-bold text-white">
        {initial}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-teal-600 text-[10px] font-bold text-white">
      {initial}
    </span>
  );
}

interface PostCardProps {
  post: BlogPostSummary;
  variant?: CardVariant;
}

export async function PostCard({ post, variant = 'standard' }: PostCardProps) {
  const tCommon = await getTranslations('Common');
  const author = authorName(post);
  // ponytail: minutes computed inline — estimateReadingTime helper stays English-only, not wired here
  const readMinutes = Math.max(1, Math.round((post.title + ' ' + (post.excerpt ?? '')).split(/\s+/).filter(Boolean).length / 200));
  const compact = variant === 'compact';
  const isPopular = variant === 'popular';

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden bg-white transition-[transform,box-shadow,border-color] duration-300 ease-out ${
        compact
          ? 'rounded-xl border border-zinc-200/60 shadow-none hover:-translate-y-0.5 hover:border-brand-teal/15 hover:shadow-sm'
          : 'rounded-2xl border border-zinc-200/80 shadow-[0_1px_2px_rgba(3,61,74,0.06)] hover:-translate-y-1 hover:border-brand-teal/20 hover:shadow-[0_16px_40px_-12px_rgba(3,61,74,0.18)]'
      }`}
    >
      {/* ── Image (compact variant omits the image) ───────────── */}
      {!compact && (
        <Link href={`/blog/${post.slug}`} prefetch={false} className="relative block aspect-[16/10] overflow-hidden bg-zinc-100">
          {post.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImageUrl}
              alt={post.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-teal-50 to-brand-teal-100 text-brand-teal-300">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {post.category && (
            <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
              {post.category.name}
            </span>
          )}
          {isPopular && (
            <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {tCommon('blogPopular')}
            </span>
          )}
        </Link>
      )}

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className={`flex flex-1 flex-col ${compact ? 'p-4' : 'p-6'}`}>
        {!post.category && !compact && (
          <span className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-teal">
            {tCommon('blogKicker')}
          </span>
        )}
        {compact && post.category && (
          <span className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-teal">
            {post.category.name}
          </span>
        )}
        <h3 className={`text-balance font-bold leading-snug text-charcoal ${compact ? 'text-sm' : 'text-lg'}`}>
          <Link href={`/blog/${post.slug}`} prefetch={false} className="transition-colors duration-200 hover:text-brand-teal">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && !compact && (
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-[#7d7d7d]">{post.excerpt}</p>
        )}

        <div className="mt-auto pt-5">
          <div className={`flex items-center justify-between border-t border-zinc-100 ${compact ? 'pt-3' : 'pt-4'}`}>
            <div className={`flex min-w-0 items-center gap-2 text-xs text-[#9ca3af]`}>
              <AuthorMark name={author} compact={compact} />
              {!compact && <span className="truncate font-medium text-zinc-600">{author}</span>}
              {!compact && <span className="text-zinc-300">·</span>}
              <span className="tabular-nums">{post.publishedAt ? formatDate(post.publishedAt) : tCommon('blogDraft')}</span>
              {post.publishedAt && !compact && <><span className="text-zinc-300">·</span><span>{tCommon('blogMinRead', { count: readMinutes })}</span></>}
              {post.publishedAt && compact && <><span className="text-zinc-300">·</span><span className="text-[10px]">{tCommon('blogMinRead', { count: readMinutes })}</span></>}
            </div>
            {!compact && (
              <Link
                href={`/blog/${post.slug}`}
                aria-label={tCommon('blogReadAria', { title: post.title })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-brand-teal transition-all duration-300 group-hover:border-brand-teal group-hover:bg-brand-teal group-hover:text-white"
              >
                <svg className="h-4 w-4 -translate-x-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
