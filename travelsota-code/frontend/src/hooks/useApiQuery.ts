import {
  useQuery,
  type UseQueryOptions,
  type QueryKey,
} from '@tanstack/react-query';
import { apiRequest, type ApiError, type ApiRequestOptions } from '@/lib/api/client';

export function useApiQuery<TData>(
  queryKey: QueryKey,
  path: string,
  options?: Omit<
    UseQueryOptions<TData, ApiError, TData, QueryKey>,
    'queryKey' | 'queryFn'
  > & { requestOptions?: ApiRequestOptions },
) {
  const { requestOptions, ...queryOptions } = options ?? {};
  return useQuery<TData, ApiError>({
    queryKey,
    queryFn: ({ signal }) =>
      apiRequest<TData>(path, { signal, ...requestOptions }),
    ...queryOptions,
  });
}
