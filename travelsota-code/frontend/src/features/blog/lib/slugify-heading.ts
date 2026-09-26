/**
 * Shared heading slugifier — used by both server-side extractHeadings and
 * the client-side BlogArticle component so they produce identical anchor IDs.
 */
export function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Ensure every heading ID is unique within the page.
 * The first duplicate gets `-2`, the next `-3`, etc.
 */
export function uniqueHeadingIds(
  headings: { id: string; text: string }[],
): { id: string; text: string }[] {
  const seen = new Map<string, number>();
  return headings.map((h) => {
    const count = seen.get(h.id) ?? 0;
    seen.set(h.id, count + 1);
    if (count === 0) return h;
    return { ...h, id: `${h.id}-${count + 1}` };
  });
}
