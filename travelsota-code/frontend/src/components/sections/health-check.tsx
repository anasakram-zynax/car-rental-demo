'use client';

import { useEffect, useState } from 'react';
import type { StandardApiResponse } from '@/lib/schema/api';
import { getPublicEnv } from '@/lib/env/env';

interface HealthPayload {
  status: string;
  service: string;
  timestamp?: string;
  uptimeSeconds?: number;
}

const STATUS_STYLES: Record<string, string> = {
  idle: 'border-zinc-200 text-zinc-600',
  loading: 'border-blue-200 text-blue-700',
  ok: 'border-emerald-200 text-emerald-700',
  error: 'border-rose-200 text-rose-700',
};

export function HealthCheck() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function run() {
      setStatus('loading');
      try {
        const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
        setBaseUrl(NEXT_PUBLIC_API_BASE_URL);
        const response = await fetch(`${NEXT_PUBLIC_API_BASE_URL}/health`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = (await response.json()) as StandardApiResponse<HealthPayload>;

        if (!response.ok || !data?.success) {
          throw new Error(data?.message ?? 'Health check failed.');
        }

        if (!active) {
          return;
        }

        setStatus('ok');
        setMessage(data.message);
        setPayload(data.data);
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Health check failed.');
      }
    }

    run();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <div className={`rounded-2xl border bg-white px-6 py-5 ${STATUS_STYLES[status]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.3em]">health check</span>
        <span className="text-xs font-semibold">
          {status === 'loading' ? 'Checking...' : status.toUpperCase()}
        </span>
      </div>
      <p className="mt-2 text-lg font-semibold text-zinc-900">{message || '...'}</p>
      {payload ? (
        <div className="mt-3 text-sm text-zinc-600">
          <p>Service: {payload.service}</p>
          <p>Status: {payload.status}</p>
          {payload.uptimeSeconds !== undefined ? (
            <p>Uptime: {payload.uptimeSeconds}s</p>
          ) : null}
        </div>
      ) : null}
      {baseUrl ? (
        <p className="mt-3 text-xs text-zinc-500">API: {baseUrl}</p>
      ) : null}
    </div>
  );
}
