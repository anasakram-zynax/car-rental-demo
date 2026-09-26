'use client';

/**
 * Unified toast layer for ACTION feedback, built on sonner
 * (https://sonner.emilkowal.ski) — used only as an engine (queue,
 * stacking, swipe-to-dismiss, a11y, RTL). ALL visuals come from the shared
 * `NotificationCard` via `toast.custom()`, so there is no library-imposed
 * shape to fight (previously goey-toast's morphing "blob" look, which also
 * forced the white-card-plus-colored-border shape that reads as generic
 * Toastify — see NOTIFICATION_SYSTEM_CONTEXT.md v4).
 *
 * - Normal toasts live TOP-RIGHT, one queue, one visual language.
 * - `useToast()` keeps the legacy API (show/success/error/info/warning/dismiss)
 *   so the ~72 existing call sites keep working unchanged.
 * - Live system notifications do NOT render here — they go to the dedicated
 *   LiveNotificationStack (bottom-left) via notification-toast-bridge.ts,
 *   which renders the same `NotificationCard`. Position alone tells the two
 *   apart; there is no badge.
 */

import 'sonner/dist/styles.css';

import { Toaster, toast as sonnerToast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { NotificationCard, type NotificationTone } from '@/components/ui/notification-card';
import type { ToastType } from './types';

/* ── Defaults ──────────────────────────────────────────────────────── */

export const TOAST_POSITION = 'top-right' as const;
export const TOAST_VISIBLE_MAX = 5;
export const TOAST_QUEUE_MAX = 20;

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

function durationFor(type: ToastType, override?: number): number {
  if (override !== undefined) return override;
  return type === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS;
}

const TONE_BY_TYPE: Record<ToastType, NotificationTone> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/* ── Host ──────────────────────────────────────────────────────────── */

/**
 * Mount ONCE in AppProviders. Renders the sonner viewport wired to the
 * current language direction (RTL-aware); sonner only manages positioning
 * and the queue here — `pushToast()` supplies the actual card markup.
 */
export function ToastHost() {
  const { direction } = useLanguage();

  return (
    <Toaster
      position={TOAST_POSITION}
      dir={direction?.toLowerCase() === 'rtl' ? 'rtl' : 'ltr'}
      visibleToasts={TOAST_VISIBLE_MAX}
      gap={10}
      offset="20px"
      swipeDirections={['right', 'left', 'top']}
    />
  );
}

/* ── Push helpers (imperative, safe outside React too) ─────────────── */

export function pushToast(input: {
  title: string;
  type?: ToastType;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}): string | number {
  const type: ToastType = input.type ?? 'info';
  const duration = durationFor(type, input.duration);

  return sonnerToast.custom(
    (id) => (
      <NotificationCard
        tone={TONE_BY_TYPE[type]}
        title={input.title}
        message={input.description}
        action={input.action}
        durationMs={duration}
        onDismiss={() => sonnerToast.dismiss(id)}
      />
    ),
    { duration, unstyled: true },
  );
}

/* ── React hook (legacy-compatible API) ────────────────────────────── */

export interface UseToastResult {
  show: (title: string, type?: ToastType, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  dismiss: (id?: string | number) => void;
}

/**
 * Legacy-compatible toast hook.
 *
 * Old signature: `useToast()` from '@/hooks/useToast' backed by context.
 * New signature is identical from the caller's point of view; the
 * re-export at '@/hooks/useToast' keeps imports stable.
 */
export function useToast(): UseToastResult {
  return {
    show: (title, type = 'info', description) => {
      pushToast({ title, type, description });
    },
    success: (title, description) => {
      pushToast({ title, type: 'success', description });
    },
    error: (title, description) => {
      pushToast({ title, type: 'error', description });
    },
    info: (title, description) => {
      pushToast({ title, type: 'info', description });
    },
    warning: (title, description) => {
      pushToast({ title, type: 'warning', description });
    },
    dismiss: (id) => {
      if (id !== undefined) sonnerToast.dismiss(id);
      else sonnerToast.dismiss();
    },
  };
}
