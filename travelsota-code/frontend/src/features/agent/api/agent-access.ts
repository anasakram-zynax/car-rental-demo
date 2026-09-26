import { apiRequest } from '@/lib/api/client';

export interface AgentAccess {
  allowedFlightProviders: string[] | null;
  allowedHotelProviders: string[] | null;
  allowedGateways: string[] | null;
}

export function getAgentAccess() {
  return apiRequest<AgentAccess>('/agents/access', { auth: true });
}

/** null/empty allow-list = all allowed; comparison is case-insensitive. */
export function isAllowed(list: string[] | null | undefined, key: string): boolean {
  if (!list || list.length === 0) return true;
  const k = key.toLowerCase();
  return list.some((v) => v.toLowerCase() === k);
}
