'use client';

import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  alert?: { type: 'error' | 'success' | 'info'; message: string } | null;
}

// Note: the fixed MainHeader and its top offset are provided by the public
// layout, so AppShell is only a content container here.
export function AppShell({ children, alert }: AppShellProps) {
  const alertClasses =
    alert?.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : alert?.type === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700';

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        {alert ? (
          <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${alertClasses}`}>
            {alert.message}
          </div>
        ) : null}

        <main>{children}</main>
      </div>
    </div>
  );
}
