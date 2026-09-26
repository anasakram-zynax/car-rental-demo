import {
  useMutation,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { apiRequest, type ApiError, type ApiRequestOptions } from '@/lib/api/client';

export function useApiMutation<TData, TVariables = unknown>(
  path: string,
  options?: UseMutationOptions<TData, ApiError, TVariables>,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  requestOptions?: ApiRequestOptions,
) {
  return useMutation<TData, ApiError, TVariables>({
    mutationFn: (variables) =>
      apiRequest<TData>(path, {
        method,
        body: variables,
        ...requestOptions,
      }),
    ...options,
  });
}
