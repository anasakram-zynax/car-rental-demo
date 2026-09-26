/**
 * Shared reading-time estimator for blog posts.
 * Used by PostCard and FeaturedPost so estimates stay consistent.
 */
export function estimateReadingTime(html: string): string {
  const words = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
