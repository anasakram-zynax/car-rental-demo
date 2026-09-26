'use client';

/**
 * Promise-based text-input dialog — the app-wide replacement for the
 * native `prompt()` popover (blocking, unstyled, inconsistent).
 *
 * Usage:
 *   const email = await promptDialog({ title: 'Email documents to', placeholder: 'name@example.com' });
 *   if (email === null) return; // cancelled — mirrors native prompt() semantics
 *
 * Mounts an isolated React root so callers need zero local state.
 * Styling mirrors ConfirmDialog / the shared DeleteConfirm modal.
 */

import { useEffect, useId, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export interface PromptDialogOptions {
  title: string;
  /** Supports newlines, e.g. a numbered list of choices to type from. */
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Multi-line textarea instead of a single-line input. */
  multiline?: boolean;
}

interface ViewProps {
  options: PromptDialogOptions;
  resolve: (result: string | null) => void;
  cleanup: () => void;
}

function PromptDialogView({ options, resolve, cleanup }: ViewProps) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const inputId = useId();

  const finish = (result: string | null) => {
    resolve(result);
    cleanup();
  };

  useEffect(() => {
    return () => resolve(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => finish(value);

  return (
    <Modal isOpen onClose={() => finish(null)} adminSurface className="max-w-md">
      <h3 className="text-base font-bold text-gray-900 dark:text-white">{options.title}</h3>
      {options.message && (
        <p className="mt-1 whitespace-pre-line text-sm text-gray-500 dark:text-gray-400">{options.message}</p>
      )}
      <div className="mt-4">
        <label htmlFor={inputId} className="sr-only">
          {options.title}
        </label>
        {options.multiline ? (
          <textarea
            id={inputId}
            autoFocus
            rows={4}
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-teal-500 focus:ring-1 focus:ring-brand-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        ) : (
          <input
            id={inputId}
            autoFocus
            type="text"
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-teal-500 focus:ring-1 focus:ring-brand-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => finish(null)}>
          {options.cancelLabel ?? 'Cancel'}
        </Button>
        <Button onClick={submit}>{options.confirmLabel ?? 'OK'}</Button>
      </div>
    </Modal>
  );
}

/** Show a text-input dialog and resolve to the entered value, or null if cancelled. */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  let settled = false;

  return new Promise<string | null>((resolve) => {
    const cleanup = () => {
      if (settled) return;
      settled = true;
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 0);
    };

    root.render(<PromptDialogView options={options} resolve={resolve} cleanup={cleanup} />);
  });
}
