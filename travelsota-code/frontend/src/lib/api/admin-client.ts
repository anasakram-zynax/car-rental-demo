import { apiRequest } from './client';

export function adminRequest<T>(
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
) {
  return apiRequest<T>(path, {
    method: (options?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: options?.body,
    auth: true,
    ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}
