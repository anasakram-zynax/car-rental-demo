import { apiRequest } from '@/lib/api/client';
import type {
  CmsAdminMenu,
  CmsAdminPage,
  CmsFooterCategory,
  CmsFooterCategoryWithMenus,
  CmsMenuNode,
  CreateCmsMenuInput,
  CreateCmsPageInput,
  CreateFooterCategoryInput,
  MenuStructureItem,
  Paginated,
  UpdateCmsMenuInput,
  UpdateCmsPageInput,
  UpdateFooterCategoryInput,
} from '../types';

// ── Public (client) ────────────────────────────────────────────

export function getCmsMenu(position: 'HEADER' | 'FOOTER'): Promise<CmsMenuNode[]> {
  return apiRequest<CmsMenuNode[]>(`/cms/menus/${position}`);
}

// ── Admin ──────────────────────────────────────────────────────

export function getAdminCmsPages(query: { q?: string; isActive?: boolean; page?: number; limit?: number } = {}): Promise<Paginated<CmsAdminPage>> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiRequest<Paginated<CmsAdminPage>>(`/admin/cms/pages${qs ? `?${qs}` : ''}`);
}

export function getAdminCmsPage(id: string): Promise<CmsAdminPage> {
  return apiRequest<CmsAdminPage>(`/admin/cms/pages/${id}`);
}

export function createCmsPage(input: CreateCmsPageInput): Promise<CmsAdminPage> {
  return apiRequest<CmsAdminPage>('/admin/cms/pages', { method: 'POST', body: input, auth: true });
}

export function updateCmsPage(id: string, input: UpdateCmsPageInput): Promise<CmsAdminPage> {
  return apiRequest<CmsAdminPage>(`/admin/cms/pages/${id}`, { method: 'PATCH', body: input, auth: true });
}

export function deleteCmsPage(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/admin/cms/pages/${id}`, { method: 'DELETE', auth: true });
}

export function getAdminCmsMenus(): Promise<CmsAdminMenu[]> {
  return apiRequest<CmsAdminMenu[]>('/admin/cms/menus', { auth: true });
}

export function createCmsMenu(input: CreateCmsMenuInput): Promise<CmsAdminMenu> {
  return apiRequest<CmsAdminMenu>('/admin/cms/menus', { method: 'POST', body: input, auth: true });
}

export function updateCmsMenu(id: string, input: UpdateCmsMenuInput): Promise<CmsAdminMenu> {
  return apiRequest<CmsAdminMenu>(`/admin/cms/menus/${id}`, { method: 'PATCH', body: input, auth: true });
}

export function deleteCmsMenu(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/admin/cms/menus/${id}`, { method: 'DELETE', auth: true });
}

export function saveCmsMenuStructure(items: MenuStructureItem[]): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>('/admin/cms/menus/structure', { method: 'PUT', body: { items }, auth: true });
}

// ── Footer categories (admin) ─────────────────────────────────

export function getFooterCategories(): Promise<CmsFooterCategory[]> {
  return apiRequest<CmsFooterCategory[]>('/admin/cms/footer-categories', { auth: true });
}

export function createFooterCategory(input: CreateFooterCategoryInput): Promise<CmsFooterCategory> {
  return apiRequest<CmsFooterCategory>('/admin/cms/footer-categories', { method: 'POST', body: input, auth: true });
}

export function updateFooterCategory(id: string, input: UpdateFooterCategoryInput): Promise<CmsFooterCategory> {
  return apiRequest<CmsFooterCategory>(`/admin/cms/footer-categories/${id}`, { method: 'PATCH', body: input, auth: true });
}

export function deleteFooterCategory(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/admin/cms/footer-categories/${id}`, { method: 'DELETE', auth: true });
}

// ── Public footer ─────────────────────────────────────────────

export function getCmsFooter(): Promise<CmsFooterCategoryWithMenus[]> {
  return apiRequest<CmsFooterCategoryWithMenus[]>('/cms/footer');
}
