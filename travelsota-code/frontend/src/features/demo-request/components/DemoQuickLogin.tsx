"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getQuickCredentials, type QuickCredentials } from '../api/demo-sessions';
import { DEMO_UI_ENABLED } from '@/lib/flags';

/**
 * Cached quick-credentials + role matcher.
 * `matchDemoRole` lets the sign-in flow detect a demo login and start
 * tracking without a second credentials fetch.
 */
let cachedCreds: QuickCredentials | null = null;
let inFlight: Promise<QuickCredentials> | null = null;

function loadCredentials(): Promise<QuickCredentials> {
  if (cachedCreds) return Promise.resolve(cachedCreds);
  if (!inFlight) {
    inFlight = getQuickCredentials()
      .then((data) => {
        cachedCreds = data;
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function matchDemoRole(email: string | null | undefined): 'admin' | 'agent' | 'user' | null {
  if (!email || !cachedCreds) return null;
  const normalized = email.trim().toLowerCase();
  const { credentials } = cachedCreds;
  if (normalized === credentials.admin.email.trim().toLowerCase()) return 'admin';
  if (normalized === credentials.agent.email.trim().toLowerCase()) return 'agent';
  if (normalized === credentials.user.email.trim().toLowerCase()) return 'user';
  return null;
}

interface DemoQuickLoginProps {
  onPrefill: (email: string, password: string) => void;
}

/**
 * Three demo prefill buttons shown above the sign-in form.
 * PREFILL ONLY (product decision) — the user still presses "Sign in" so they
 * see exactly what is being submitted. Visually subordinate to the primary
 * CTA per the auth page override (design-system/travalq/pages/auth.md).
 */
export default function DemoQuickLogin({ onPrefill }: DemoQuickLoginProps) {
  const tCommon = useTranslations('Common');
  const [creds, setCreds] = useState<QuickCredentials | null>(null);

  useEffect(() => {
    if (!DEMO_UI_ENABLED) return;
    let cancelled = false;
    loadCredentials()
      .then((data) => {
        if (cancelled) return;
        setCreds(data);
      })
      .catch(() => {
        // Demo surface unavailable (flag off upstream / network) — stay hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!DEMO_UI_ENABLED || !creds) return null;

  const options: Array<{ role: 'admin' | 'agent' | 'user'; label: string }> = [
    { role: 'admin', label: tCommon('demoLoginAsAdmin') },
    { role: 'agent', label: tCommon('demoLoginAsAgent') },
    { role: 'user', label: tCommon('demoLoginAsUser') },
  ];

  const handlePick = (role: 'admin' | 'agent' | 'user') => {
    const c = creds.credentials[role];
    onPrefill(c.email, c.password);
  };

  return (
    <div
      role="group"
      aria-label={tCommon('demoAccessTitle')}
      className="mb-6 rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40"
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {tCommon('demoAccessHint')}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((opt) => (
          <button
            key={opt.role}
            type="button"
            onClick={() => handlePick(opt.role)}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-teal/30 bg-white px-3 py-2 text-sm font-semibold text-brand-teal transition-colors duration-200 hover:border-brand-teal hover:bg-brand-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal dark:bg-gray-900/60 dark:text-brand-teal-300 dark:hover:bg-brand-teal-950/40"
          >
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-gray-400 dark:text-gray-500">
        {tCommon('demoPrefillHint')}
      </p>
    </div>
  );
}
