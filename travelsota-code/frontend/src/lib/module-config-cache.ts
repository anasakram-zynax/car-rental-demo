'use client';

import type { ModulesConfigMap } from '@/features/admin/api/admin-settings';

const KEY = 'tso_module_config_v1';

/** Read last-saved module config (names + order) for instant first paint. */
export function readModuleConfigCache(): ModulesConfigMap | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ModulesConfigMap;
    return parsed?.flights && parsed?.hotels ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeModuleConfigCache(value: ModulesConfigMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage full / private mode — ignore */
  }
}