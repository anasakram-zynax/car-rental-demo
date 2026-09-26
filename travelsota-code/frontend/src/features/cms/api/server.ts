import { getPublicEnv } from '@/lib/env/env';
import type { CmsPage } from '../types';

function apiUrl(path: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL;
  return base.startsWith('http') ? `${base}${path}` : path;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`CMS API ${path} failed with status ${res.status}`);
  }
  const payload: unknown = await res.json();
  return (payload as { data: T }).data;
}

export function getCmsPage(slug: string, lang?: string): Promise<CmsPage> {
  const qs = lang && lang !== 'en' ? `?lang=${encodeURIComponent(lang)}` : '';
  return get<CmsPage>(`/cms/pages/${encodeURIComponent(slug)}${qs}`);
}
