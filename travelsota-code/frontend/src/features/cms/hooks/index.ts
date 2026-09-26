import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCmsMenu,
  createCmsPage,
  createFooterCategory,
  deleteCmsMenu,
  deleteCmsPage,
  deleteFooterCategory,
  getAdminCmsMenus,
  getAdminCmsPage,
  getAdminCmsPages,
  getCmsFooter,
  getCmsMenu,
  getFooterCategories,
  saveCmsMenuStructure,
  updateCmsMenu,
  updateCmsPage,
  updateFooterCategory,
} from '../api/client';
import type {
  CreateCmsMenuInput,
  CreateCmsPageInput,
  CreateFooterCategoryInput,
  MenuStructureItem,
  UpdateCmsMenuInput,
  UpdateCmsPageInput,
  UpdateFooterCategoryInput,
} from '../types';

export const CMS_QUERY_KEYS = {
  menu: (position: string) => ['cms', 'menu', position] as const,
  pages: (query?: { q?: string; isActive?: boolean; page?: number; limit?: number }) =>
    ['admin', 'cms', 'pages', query ?? {}] as const,
  page: (id: string) => ['admin', 'cms', 'pages', id] as const,
  menus: ['admin', 'cms', 'menus'] as const,
};

// ── Public nav wiring ──────────────────────────────────────────

export function useCmsMenu(position: 'HEADER' | 'FOOTER') {
  return useQuery({
    queryKey: CMS_QUERY_KEYS.menu(position),
    queryFn: () => getCmsMenu(position),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ── Admin pages ────────────────────────────────────────────────

export function useAdminCmsPages(query: { q?: string; isActive?: boolean; page?: number; limit?: number }) {
  return useQuery({
    queryKey: CMS_QUERY_KEYS.pages(query),
    queryFn: () => getAdminCmsPages(query),
  });
}

export function useAdminCmsPage(id: string | undefined) {
  return useQuery({
    queryKey: CMS_QUERY_KEYS.page(id ?? ''),
    queryFn: () => getAdminCmsPage(id!),
    enabled: !!id,
  });
}

export function useCreateCmsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCmsPageInput) => createCmsPage(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] }),
  });
}

export function useUpdateCmsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCmsPageInput }) => updateCmsPage(id, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] });
      qc.setQueryData(CMS_QUERY_KEYS.page(data.id), data);
    },
  });
}

export function useDeleteCmsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCmsPage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] }),
  });
}

// ── Admin menus ────────────────────────────────────────────────

export function useAdminCmsMenus() {
  return useQuery({
    queryKey: CMS_QUERY_KEYS.menus,
    queryFn: getAdminCmsMenus,
  });
}

export function useCreateCmsMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCmsMenuInput) => createCmsMenu(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CMS_QUERY_KEYS.menus });
      qc.invalidateQueries({ queryKey: ['cms', 'menu'] });
    },
  });
}

export function useUpdateCmsMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCmsMenuInput }) => updateCmsMenu(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CMS_QUERY_KEYS.menus });
      qc.invalidateQueries({ queryKey: ['cms', 'menu'] });
    },
  });
}

export function useDeleteCmsMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCmsMenu(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CMS_QUERY_KEYS.menus });
      qc.invalidateQueries({ queryKey: ['cms', 'menu'] });
    },
  });
}

export function useSaveCmsMenuStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: MenuStructureItem[]) => saveCmsMenuStructure(items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CMS_QUERY_KEYS.menus });
      qc.invalidateQueries({ queryKey: ['cms', 'menu'] });
    },
  });
}

// ── Footer categories ─────────────────────────────────────────

export function useFooterCategories() {
  return useQuery({
    queryKey: ['admin', 'cms', 'footer-categories'],
    queryFn: getFooterCategories,
  });
}

export function useCreateFooterCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFooterCategoryInput) => createFooterCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cms', 'footer-categories'] }),
  });
}

export function useUpdateFooterCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFooterCategoryInput }) => updateFooterCategory(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cms', 'footer-categories'] }),
  });
}

export function useDeleteFooterCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFooterCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cms', 'footer-categories'] }),
  });
}

export function useCmsFooter() {
  return useQuery({
    queryKey: ['cms', 'footer-categories'],
    queryFn: getCmsFooter,
    staleTime: 60_000,
  });
}
