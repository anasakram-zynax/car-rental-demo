import { adminRequest } from '@/lib/api/admin-client';
import type {
  BlogAdminCategory,
  BlogAdminPost,
  CreateBlogCategoryInput,
  CreateBlogPostInput,
  Paginated,
  UpdateBlogCategoryInput,
  UpdateBlogPostInput,
} from '../types';

export interface AdminBlogPostsQuery {
  status?: 'DRAFT' | 'PUBLISHED';
  categoryId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export function getAdminBlogPosts(query: AdminBlogPostsQuery = {}): Promise<Paginated<BlogAdminPost>> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.q) params.set('q', query.q);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return adminRequest<Paginated<BlogAdminPost>>(`/admin/blog/posts${qs ? `?${qs}` : ''}`);
}

export function getAdminBlogPost(id: string): Promise<BlogAdminPost> {
  return adminRequest<BlogAdminPost>(`/admin/blog/posts/${id}`);
}

export function createBlogPost(input: CreateBlogPostInput): Promise<BlogAdminPost> {
  return adminRequest<BlogAdminPost>('/admin/blog/posts', { method: 'POST', body: input });
}

export function updateBlogPost(id: string, input: UpdateBlogPostInput): Promise<BlogAdminPost> {
  return adminRequest<BlogAdminPost>(`/admin/blog/posts/${id}`, { method: 'PATCH', body: input });
}

export function deleteBlogPost(id: string): Promise<{ id: string }> {
  return adminRequest<{ id: string }>(`/admin/blog/posts/${id}`, { method: 'DELETE' });
}

export function getAdminBlogCategories(): Promise<BlogAdminCategory[]> {
  return adminRequest<BlogAdminCategory[]>('/admin/blog/categories');
}

export function createBlogCategory(input: CreateBlogCategoryInput): Promise<BlogAdminCategory> {
  return adminRequest<BlogAdminCategory>('/admin/blog/categories', { method: 'POST', body: input });
}

export function updateBlogCategory(id: string, input: UpdateBlogCategoryInput): Promise<BlogAdminCategory> {
  return adminRequest<BlogAdminCategory>(`/admin/blog/categories/${id}`, { method: 'PATCH', body: input });
}

export function deleteBlogCategory(id: string): Promise<{ id: string }> {
  return adminRequest<{ id: string }>(`/admin/blog/categories/${id}`, { method: 'DELETE' });
}
