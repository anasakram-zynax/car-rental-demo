'use client';

import { useModules } from '@/lib/PublicModulesContext';
import type { PublicModulesInfo } from '@/features/admin/api/admin-settings';

/**
 * Public module visibility + display names + order, seeded by the server at
 * request time (no flash of defaults) and revalidated by the provider.
 * A module is live when at least one supplier is enabled; order[0] is the
 * default search mode.
 */
export function usePublicModules(): {
  modules: PublicModulesInfo | null;
  label: (key: 'flights' | 'hotels', fallback: string) => string;
  isEnabled: (key: 'flights' | 'hotels') => boolean;
  order: Array<'flights' | 'hotels'>;
} {
  const modules = useModules();
  const order = modules?.order ?? (['flights', 'hotels'] as Array<'flights' | 'hotels'>);

  return {
    modules,
    label: (key, fallback) => (modules ? modules[key].name || fallback : fallback),
    isEnabled: (key) => (modules ? modules[key].enabled : true),
    order,
  };
}