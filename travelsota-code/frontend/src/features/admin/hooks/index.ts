import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getModulesSummary,
  getTravelportProvider,
  setTravelportEnabled,
  setTravelportCredentials,
  testTravelportConnection,
} from '../api/admin-settings';
import type { TravelportProviderConfig } from '../api/admin-settings';

export function useAdminModules() {
  return useQuery({
    queryKey: ['admin-modules'],
    queryFn: getModulesSummary,
  });
}

export function useAdminTravelportConfig() {
  return useQuery({
    queryKey: ['admin-travelport'],
    queryFn: getTravelportProvider,
  });
}

export function useAdminSetTravelportEnabled() {
  return useMutation({
    mutationFn: (enabled: boolean) => setTravelportEnabled(enabled),
  });
}

export function useAdminSetTravelportCredentials() {
  return useMutation({
    mutationFn: (config: TravelportProviderConfig['config']) => setTravelportCredentials(config),
  });
}

export function useAdminTestConnection() {
  return useMutation({
    mutationFn: testTravelportConnection,
  });
}
