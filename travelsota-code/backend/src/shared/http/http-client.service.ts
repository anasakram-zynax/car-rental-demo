import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type {
  HttpClientResponse,
  HttpRequestOptions,
} from './http-client.types';
import * as https from 'node:https';
import * as http from 'node:http';

@Injectable()
export class HttpClientService {
  constructor(private readonly configService: AppConfigService) {}

  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpClientResponse<T>> {
    const timeoutMs =
      options.timeoutMs ?? this.configService.http.defaultTimeoutMs;
    const retries = options.retries ?? this.configService.http.defaultRetries;
    const retryDelayMs =
      options.retryDelayMs ?? this.configService.http.retryDelayMs;

    const useMtls = !!(options.sslCert && options.sslKey);

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= retries) {
      try {
        if (useMtls) {
          return await this.mtlsRequest<T>(url, options, timeoutMs);
        }

        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers: options.headers,
          body: options.body,
          signal: AbortSignal.timeout(timeoutMs),
        });

        const rawBody = await response.text();
        const data = this.parseResponseBody<T>(
          rawBody,
          response.headers.get('content-type'),
          options.responseType ?? 'auto',
        );

        return {
          status: response.status,
          ok: response.ok,
          headers: response.headers,
          data,
          rawBody,
        };
      } catch (error) {
        lastError = error;
        const errorName =
          typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name: string }).name)
            : '';

        const isTimeoutError =
          errorName === 'TimeoutError' || errorName === 'AbortError';

        if (attempt === retries) {
          if (isTimeoutError) {
            throw new GatewayTimeoutException(
              `Upstream request timed out after ${timeoutMs}ms.`,
            );
          }

          throw new BadGatewayException({
            message: 'Failed to call upstream service.',
            cause: error instanceof Error ? error.message : String(error),
          });
        }

        await this.sleep(retryDelayMs * (attempt + 1));
      }

      attempt += 1;
    }

    throw new BadGatewayException({
      message: 'Failed to call upstream service.',
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  private mtlsRequest<T = unknown>(
    url: string,
    options: HttpRequestOptions,
    timeoutMs: number,
  ): Promise<HttpClientResponse<T>> {
    return new Promise<HttpClientResponse<T>>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';

      const agent = new https.Agent({
        cert: options.sslCert,
        key: options.sslKey,
        rejectUnauthorized: true,
      });

      const requestOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method ?? 'GET',
        headers: options.headers,
        agent,
        timeout: timeoutMs,
      };

      const mod = isHttps ? https : http;
      const req = mod.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const contentType = res.headers['content-type'] ?? null;
          const data = this.parseResponseBody<T>(
            rawBody,
            contentType,
            options.responseType ?? 'auto',
          );

          resolve({
            status: res.statusCode ?? 500,
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            headers: new Headers(res.headers as Record<string, string>),
            data,
            rawBody,
          });
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        const err = new Error('TimeoutError');
        err.name = 'TimeoutError';
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  private parseResponseBody<T>(
    rawBody: string,
    contentType: string | null,
    responseType: HttpRequestOptions['responseType'],
  ): T | string | null {
    if (!rawBody) {
      return null;
    }

    const shouldParseJson =
      responseType === 'json' ||
      (responseType === 'auto' &&
        contentType?.toLowerCase().includes('application/json'));

    if (!shouldParseJson) {
      return rawBody;
    }

    try {
      return JSON.parse(rawBody) as T;
    } catch {
      return rawBody;
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
