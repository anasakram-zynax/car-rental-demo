'use client';

/**
 * Promise-based confirmation dialog — the app-wide replacement for the
 * native `confirm()` popover (blocking, unstyled, inconsistent).
 *
 * Usage:
 *   if (!(await confirmDialog({ title: 'Delete role?', message: 'This cannot be undone.', destructive: true }))) return;
 *
 * Mounts an isolated React root so callers need zero local state.
 * Styling mirrors the shared DeleteConfirm modal.
 */

import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling (red confirm button + warning icon). */
  destructive?: boolean;
}

interface ViewProps {
  options: ConfirmDialogOptions;
  resolve: (result: boolean) => void;
  cleanup: () => void;
}

function ConfirmDialogView({ options, resolve, cleanup }: ViewProps) {
  const finish = (result: boolean) => {
    resolve(result);
    cleanup();
  };

  // Escape already closes via Modal; still keep the modal open-guard tight.
  useEffect(() => {
    return () => resolve(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const destructive = options.destructive ?? true;

  return (
    <Modal isOpen onClose={() => finish(false)} adminSurface className="max-w-md">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            destructive
              ? 'bg-error-50 dark:bg-error-900/20'
              : 'bg-brand-teal-50 dark:bg-brand-teal-900/20'
          }`}
        >
          {destructive ? (
            <svg className="h-5 w-5 text-error-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-brand-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
          )}
        </span>
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{options.title}</h3>
          {options.message && (
            <p className="mt-1 whitespace-pre-line text-sm text-gray-500 dark:text-gray-400">{options.message}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => finish(false)}>
          {options.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          onClick={() => finish(true)}
          autoFocus
          className={
            destructive
              ? 'bg-error-500 hover:bg-error-600 focus-visible:ring-error-500'
              : undefined
          }
        >
          {options.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Modal>
  );
}

/** Show a confirmation dialog and resolve to the user's choice. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  let settled = false;

  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      if (settled) return;
      settled = true;
      // Let React flush the close render before unmounting.
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 0);
    };

    root.render(
      <ConfirmDialogView
        options={options}
        resolve={resolve}
        cleanup={cleanup}
      />,
    );
  });
}
