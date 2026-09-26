export interface BlogAuthor {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface BlogCategoryWithCount extends BlogCategory {
  description: string | null;
  postCount: number;
}

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  isFeatured: boolean;
  viewCount: number;
  category: BlogCategory | null;
  author: BlogAuthor | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  bodyHtml: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  noindex: boolean;
  canonicalUrl: string | null;
  related: BlogPostSummary[];
  prev: BlogPostSummary | null;
  next: BlogPostSummary | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED';

export interface BlogAdminAuthor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface BlogAdminPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  bodyHtml: string;
  status: BlogPostStatus;
  publishedAt: string | null;
  isFeatured: boolean;
  viewCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  noindex: boolean;
  canonicalUrl: string | null;
  categoryId: string | null;
  category: BlogCategory | null;
  author: BlogAdminAuthor | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogAdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { posts: number };
}

export interface CreateBlogPostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  bodyHtml?: string;
  status?: BlogPostStatus;
  isFeatured?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  noindex?: boolean;
  canonicalUrl?: string;
  categoryId?: string;
  scheduledAt?: string;
}

export type UpdateBlogPostInput = Partial<CreateBlogPostInput>;

export interface CreateBlogCategoryInput {
  name: string;
  slug?: string;
  description?: string;
}

export type UpdateBlogCategoryInput = Partial<CreateBlogCategoryInput>;
