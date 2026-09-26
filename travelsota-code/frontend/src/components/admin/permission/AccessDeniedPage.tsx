'use client';

import Link from 'next/link';
import { LockIcon } from '@/icons';

interface AccessDeniedPageProps {
  title?: string;
  message?: string;
  showBackLink?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function AccessDeniedPage({
  title = 'Access Denied',
  message = 'You do not have permission to access this page. Please contact your administrator if you believe this is an error.',
  showBackLink = true,
  backHref = '/admin',
  backLabel = 'Back to Dashboard',
}: AccessDeniedPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Large lock icon */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
          <LockIcon className="h-12 w-12 text-error-500" />
        </div>

        {/* Error code */}
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-error-500">
          403 Forbidden
        </p>

        {/* Title */}
        <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>

        {/* Message */}
        <p className="mb-8 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          {showBackLink && (
            <Link
              href={backHref}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#012830]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              {backLabel}
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
