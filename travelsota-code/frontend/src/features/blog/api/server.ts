import { getPublicEnv } from '@/lib/env/env';
import type {
  BlogCategoryWithCount,
  BlogPostDetail,
  BlogPostSummary,
  Paginated,
} from '../types';

function apiUrl(path: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL;
  return base.startsWith('http') ? `${base}${path}` : path;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`Blog API ${path} failed with status ${res.status}`);
  }
  const payload: unknown = await res.json();
  return (payload as { data: T }).data;
}

export interface BlogPostsQuery {
  categorySlug?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export function getBlogPosts(query: BlogPostsQuery = {}): Promise<Paginated<BlogPostSummary>> {
  const params = new URLSearchParams();
  if (query.categorySlug) params.set('categorySlug', query.categorySlug);
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return get<Paginated<BlogPostSummary>>(`/blog/posts${qs ? `?${qs}` : ''}`);
}

export function getBlogPost(slug: string): Promise<BlogPostDetail> {
  return get<BlogPostDetail>(`/blog/posts/${encodeURIComponent(slug)}`);
}

export function getBlogCategories(): Promise<BlogCategoryWithCount[]> {
  return get<BlogCategoryWithCount[]>('/blog/categories');
}
