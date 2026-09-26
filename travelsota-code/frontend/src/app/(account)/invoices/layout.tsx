import type { ReactNode } from 'react';

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
