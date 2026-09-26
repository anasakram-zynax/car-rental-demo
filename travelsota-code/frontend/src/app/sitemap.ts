import type { MetadataRoute } from 'next';
import { getBlogPosts } from '@/features/blog/api/server';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travelsota.com';

/** Hard timeout so a slow/unresponsive backend can never hang the build. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${siteUrl}/signin`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  ];

  let blogPosts: MetadataRoute.Sitemap = [];
  try {
    const posts = await withTimeout(getBlogPosts({ limit: 50 }), 15_000);
    if (posts) {
      blogPosts = posts.data
        .filter((post) => post.publishedAt)
        .map((post) => ({
          url: `${siteUrl}/blog/${post.slug}`,
          lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }));
    }
  } catch {}

  return [...staticPages, ...blogPosts];
}
