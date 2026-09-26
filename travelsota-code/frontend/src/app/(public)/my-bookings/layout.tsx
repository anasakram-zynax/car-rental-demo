import type { ReactNode } from 'react';

export default function MyBookingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
