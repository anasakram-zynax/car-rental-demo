'use client';

import React from 'react';

/**
 * Shared stat-card primitives for both the admin and agent dashboards.
 * One accent (brand-teal), one shape, one tooltip pattern — used everywhere
 * so the two dashboards read as one product.
 */

export function InfoTip({ children, className = '', align = 'center' }: { children: React.ReactNode; className?: string; align?: 'center' | 'right' }) {
  return (
    <span className={`group relative inline-flex cursor-help items-center align-middle ${className}`}>
      <svg
        className="size-3.5 text-gray-400 transition-colors group-hover:text-brand-teal-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {/* ponytail: right-align near card edges — centered tips overflow the viewport and cause page scroll */}
      <span className={`pointer-events-none absolute bottom-full z-50 mb-1.5 hidden w-52 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block dark:bg-gray-800 dark:text-gray-100 ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
        {children}
      </span>
    </span>
  );
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'warning' | 'error' | 'success' | 'accent';
  tip?: React.ReactNode;
  children?: React.ReactNode;
}

const TONE_VALUE: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-gray-900 dark:text-white',
  accent: 'text-brand-teal-600 dark:text-brand-teal-400',
  success: 'text-success-600 dark:text-success-400',
  warning: 'text-warning-600 dark:text-warning-400',
  error: 'text-error-600 dark:text-error-400',
};

const TONE_BAR: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-gray-200 dark:bg-gray-700',
  accent: 'bg-brand-teal-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export function StatCard({ label, value, sub, tone = 'default', tip, children }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <span className={`absolute inset-y-0 left-0 w-1 ${TONE_BAR[tone]}`} />
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {tip && <InfoTip>{tip}</InfoTip>}
      </div>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${TONE_VALUE[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
      {children}
    </div>
  );
}

export default StatCard;
