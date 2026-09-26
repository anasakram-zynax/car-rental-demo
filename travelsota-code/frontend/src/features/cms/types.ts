export interface CmsMenuNode {
  id: string;
  label: string;
  url: string | null;
  target: '_self' | '_blank';
  children: CmsMenuNode[];
}

export interface CmsPage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CmsAdminPage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  nameTranslations: Record<string, string> | null;
  contentTranslations: Record<string, string> | null;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CmsPosition = 'HEADER' | 'FOOTER' | 'BOTH';
export type CmsLinkType = 'PAGE' | 'EXTERNAL';
export type CmsTarget = 'SELF' | 'BLANK';

export interface CmsAdminMenu {
  id: string;
  label: string;
  linkType: CmsLinkType;
  pageId: string | null;
  url: string | null;
  target: CmsTarget;
  position: CmsPosition;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  footerCategoryId: string | null;
  footerCategory?: { id: string; name: string } | null;
  cmsPage: { id: string; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateCmsPageInput {
  name: string;
  slug?: string;
  description?: string;
  content?: string;
  nameTranslations?: Record<string, string>;
  contentTranslations?: Record<string, string>;
  isActive?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  canonicalUrl?: string;
  noindex?: boolean;
}

export type UpdateCmsPageInput = Partial<CreateCmsPageInput>;

export interface CreateCmsMenuInput {
  label: string;
  linkType?: CmsLinkType;
  pageId?: string;
  url?: string;
  target?: CmsTarget;
  position?: CmsPosition;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
  footerCategoryId?: string;
}

export type UpdateCmsMenuInput = Partial<CreateCmsMenuInput>;

export interface MenuStructureItem {
  id: string;
  position: CmsPosition;
  parentId: string | null;
  sortOrder: number;
}

export interface CmsFooterCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { menus: number };
}

export interface CmsFooterCategoryWithMenus {
  id: string;
  name: string;
  slug: string;
  menus: { id: string; label: string; url: string | null; target: string }[];
}

export interface CreateFooterCategoryInput {
  name: string;
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateFooterCategoryInput = Partial<CreateFooterCategoryInput>;
