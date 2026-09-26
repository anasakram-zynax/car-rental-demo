import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBlogCategory,
  createBlogPost,
  deleteBlogCategory,
  deleteBlogPost,
  getAdminBlogCategories,
  getAdminBlogPost,
  getAdminBlogPosts,
  updateBlogCategory,
  updateBlogPost,
  type AdminBlogPostsQuery,
} from '../api/admin';
import type {
  BlogAdminPost,
  CreateBlogCategoryInput,
  CreateBlogPostInput,
  UpdateBlogCategoryInput,
  UpdateBlogPostInput,
} from '../types';

export const BLOG_QUERY_KEYS = {
  posts: (query: AdminBlogPostsQuery) => ['admin', 'blog', 'posts', query] as const,
  post: (id: string) => ['admin', 'blog', 'posts', id] as const,
  categories: ['admin', 'blog', 'categories'] as const,
};

export function useAdminBlogPosts(query: AdminBlogPostsQuery) {
  return useQuery({
    queryKey: BLOG_QUERY_KEYS.posts(query),
    queryFn: () => getAdminBlogPosts(query),
  });
}

export function useAdminBlogPost(id: string | undefined) {
  return useQuery<BlogAdminPost>({
    queryKey: BLOG_QUERY_KEYS.post(id ?? ''),
    queryFn: () => getAdminBlogPost(id!),
    enabled: !!id,
  });
}

export function useAdminBlogCategories() {
  return useQuery({
    queryKey: BLOG_QUERY_KEYS.categories,
    queryFn: getAdminBlogCategories,
  });
}

export function useCreateBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBlogPostInput) => createBlogPost(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blog', 'posts'] }),
  });
}

export function useUpdateBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBlogPostInput }) => updateBlogPost(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog', 'posts'] });
      queryClient.setQueryData(BLOG_QUERY_KEYS.post(data.id), data);
    },
  });
}

export function useDeleteBlogPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBlogPost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blog', 'posts'] }),
  });
}

export function useCreateBlogCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBlogCategoryInput) => createBlogCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.categories }),
  });
}

export function useUpdateBlogCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBlogCategoryInput }) => updateBlogCategory(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.categories }),
  });
}

export function useDeleteBlogCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBlogCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.categories }),
  });
}
