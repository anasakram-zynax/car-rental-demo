'use client';

/**
 * Shared rectangular notification card — the single visual language for
 * BOTH notification surfaces in the app:
 *
 * - Action toasts (top-right, via `@/lib/toast`, rendered through sonner's
 *   `toast.custom()`).
 * - Live system events (bottom-left, `LiveNotificationStack`).
 *
 * Design (v4 — replaces the goey-toast "white card + colored left border"
 * look, which reads as generic Toastify): white surface, soft shadow,
 * slightly-softened rectangle (6px), NO colored border bar — color lives in
 * the filled icon badge only, plus an optional bottom progress bar for
 * time-remaining. Position alone tells live apart from action toasts; there
 * is no text badge here by design.
 */

import { AlertTriangle, CheckCircle, Info, Siren, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type NotificationTone = 'success' | 'error' | 'warning' | 'info' | 'critical';

const TONE_ICON: Record<NotificationTone, typeof Info> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  critical: Siren,
};

const TONE_CLASSES: Record<NotificationTone, { iconWrap: string; icon: string; bar: string }> = {
  success: { iconWrap: 'bg-green-50', icon: 'text-green-600', bar: 'bg-green-500' },
  error: { iconWrap: 'bg-red-50', icon: 'text-red-600', bar: 'bg-red-500' },
  warning: { iconWrap: 'bg-amber-50', icon: 'text-amber-600', bar: 'bg-amber-500' },
  info: { iconWrap: 'bg-blue-50', icon: 'text-blue-600', bar: 'bg-blue-500' },
  critical: { iconWrap: 'bg-red-100', icon: 'text-red-700', bar: 'bg-red-600' },
};

export interface NotificationCardProps {
  tone: NotificationTone;
  title: string;
  message?: string;
  /** Total lifetime in ms — drives the bottom progress bar. Omitted = no bar. */
  durationMs?: number;
  /**
   * Remounts the progress bar (restarting its CSS animation) when this
   * value changes — for a card whose content is refreshed in place (e.g.
   * the live "N more" summary) rather than replaced. Stable/omitted means
   * "never restart", which is correct for one-shot toasts.
   */
  barResetKey?: string | number;
  /** Freezes the progress bar (hover-to-pause). */
  paused?: boolean;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  onClick?: () => void;
  className?: string;
}

export function NotificationCard({
  tone,
  title,
  message,
  durationMs,
  barResetKey,
  paused = false,
  action,
  onDismiss,
  onClick,
  className,
}: NotificationCardProps) {
  const Icon = TONE_ICON[tone];
  const styles = TONE_CLASSES[tone];

  return (
    <div
      role="status"
      onClick={onClick}
      className={cn(
        'travalq-notif-card relative flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-md border border-gray-200 bg-white py-3.5 pl-4 pr-9 shadow-lg shadow-gray-900/[0.06]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <span className={cn('mt-0.5 flex-shrink-0 rounded-full p-1.5', styles.iconWrap)} aria-hidden="true">
        <Icon className={cn('h-4 w-4', styles.icon)} strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 text-gray-900">{title}</p>
        {message && <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-gray-600">{message}</p>}
        {action && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className={cn('mt-1 text-[13px] font-semibold hover:underline', styles.icon)}
          >
            {action.label}
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 before:absolute before:-inset-2.5 before:content-['']"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {durationMs !== undefined && durationMs > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-md bg-gray-100">
          <div
            key={barResetKey}
            className={cn('h-full origin-left', styles.bar)}
            style={{
              animation: `travalq-notif-shrink ${durationMs}ms linear forwards`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  );
}
