'use client';

import React from 'react';

/**
 * Catches render crashes inside dashboard modals and shows the real error
 * instead of killing the whole tab. Temporary diagnostic armor around the
 * wallet top-up / withdraw flows — remove once the withdraw crash is traced.
 */
interface State {
  error: Error | null;
}

export class ModalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('[ModalErrorBoundary]', error);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => this.setState({ error: null })}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Something broke opening this dialog</h3>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {this.state.error.message || String(this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 w-full cursor-pointer rounded-xl bg-brand-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal-700"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
