import { adminRequest } from '@/lib/api/admin-client';

export interface LanguageSummary {
  id: string;
  code: string;
  name: string;
  direction: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LanguageDetail = LanguageSummary;

export function getLanguages() {
  return adminRequest<LanguageSummary[]>('/admin/languages');
}

export function getLanguage(id: string) {
  return adminRequest<LanguageDetail>(`/admin/languages/${id}`);
}

export function createLanguage(data: {
  code: string;
  name: string;
  direction: string;
  isDefault?: boolean;
}) {
  return adminRequest<LanguageDetail>('/admin/languages', {
    method: 'POST',
    body: data,
  });
}

export function updateLanguage(
  id: string,
  data: {
    code?: string;
    name?: string;
    direction?: string;
    isDefault?: boolean;
  },
) {
  return adminRequest<LanguageDetail>(`/admin/languages/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export function deactivateLanguage(id: string) {
  return adminRequest<LanguageDetail>(`/admin/languages/${id}/deactivate`, {
    method: 'POST',
    body: {},
  });
}

export function deleteLanguage(id: string) {
  return adminRequest<unknown>(`/admin/languages/${id}`, { method: 'DELETE' });
}

export function activateLanguage(id: string) {
  return adminRequest<LanguageDetail>(`/admin/languages/${id}/activate`, {
    method: 'POST',
    body: {},
  });
}

export function setDefaultLanguage(id: string) {
  return adminRequest<LanguageDetail>(`/admin/languages/${id}/set-default`, {
    method: 'POST',
    body: {},
  });
}

export interface TranslationWarning {
  namespace: string;
  key: string;
  reason: string;
}

export interface GeneratedTranslations {
  fileCount: number;
  keys: number;
  content: Record<string, unknown>;
  warnings: TranslationWarning[];
  charsUsed: number;
}

export interface TranslationConfigView {
  provider: 'gtx';
  keyRequired: false;
  monthlyCharLimit: number;
  charsUsedThisPeriod: number;
  remainingChars: number;
  periodKey: string;
}

export function generateTranslations(
  id: string,
  sourceContent: Record<string, unknown>,
) {
  return adminRequest<GeneratedTranslations>(
    `/admin/languages/${id}/generate-translations`,
    {
      method: 'POST',
      body: { sourceContent },
      timeoutMs: 600000, // gtx = 1 req/key + throttle; full file takes minutes
    },
  );
}

export function getTranslationConfig() {
  return adminRequest<TranslationConfigView>('/admin/languages/translate/config');
}

export function saveTranslationConfig(data: { monthlyCharLimit?: number }) {
  return adminRequest<TranslationConfigView>('/admin/languages/translate/config', {
    method: 'PUT',
    body: data,
  });
}

export function testTranslationConnection() {
  return adminRequest<{ ok: boolean; translated: string; chars: number }>(
    '/admin/languages/translate/test',
    { method: 'POST', body: {} },
  );
}
