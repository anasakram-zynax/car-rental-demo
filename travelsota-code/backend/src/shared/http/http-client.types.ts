export type HttpResponseType = 'auto' | 'json' | 'text';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  responseType?: HttpResponseType;
  sslCert?: string;
  sslKey?: string;
}

export interface HttpClientResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T | string | null;
  rawBody: string;
}
