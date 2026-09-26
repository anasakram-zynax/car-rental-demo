import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPublicSiteSettings,
  updateSiteSettings,
  type SiteSettings,
  type UpdateSiteSettingsInput,
} from '@/features/admin/api/admin-settings-contact';
import { useToast } from '@/hooks/useToast';

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ['site-settings'],
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSiteSettings() {
  const queryClient = useQueryClient();
  const toasts = useToast();

  return useMutation<SiteSettings, Error, UpdateSiteSettingsInput>({
    mutationFn: (data) => updateSiteSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      toasts.success('Contact & Social saved', 'Site settings updated.');
    },
    onError: (err) => {
      const message =
        (err as { message?: string } | null)?.message ??
        'Could not update site settings. Please try again.';
      toasts.error('Save failed', message);
    },
  });
}
