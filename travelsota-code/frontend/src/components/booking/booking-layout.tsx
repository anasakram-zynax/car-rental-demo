'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

interface BookingLayoutProps {
  children: ReactNode;
  /** Sticky sidebar shown on desktop (right side). */
  sidebar?: ReactNode;
  /** Title in the minimal header bar. */
  title?: string;
  /** Show back-to-search link in the minimal header. */
  backHref?: string;
  backLabel?: string;
}

/**
 * Enclosed checkout layout — stripped header (no MainHeader/MainFooter),
 * max-width container, mobile-first with optional sticky sidebar.
 *
 * Used by flight booking details and hotel booking details pages.
 */
export function BookingLayout({
  children,
  sidebar,
  title,
  backHref = '/',
  backLabel = 'Back to Search',
}: BookingLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Minimal header bar */}
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link
            href={backHref}
            className="group flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition group-hover:border-zinc-300 group-hover:text-zinc-900">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </span>
            {backLabel}
          </Link>

          {title ? (
            <span className="truncate text-sm font-semibold text-zinc-800 max-w-[50%]">{title}</span>
          ) : null}

          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Secure booking
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className={`${sidebar ? 'lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 lg:items-start' : ''}`}>
          {/* Primary content */}
          <div className="min-w-0">{children}</div>

          {/* Sidebar — sticky on desktop, stacked on mobile */}
          {sidebar ? (
            <>
              {/* Mobile: below content */}
              <div className="mt-6 lg:hidden">{sidebar}</div>
              {/* Desktop: sticky sidebar */}
              <aside className="hidden lg:block">
                <div className="sticky top-20">{sidebar}</div>
              </aside>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
