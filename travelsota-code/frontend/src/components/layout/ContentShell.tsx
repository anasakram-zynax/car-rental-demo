import { type ReactNode } from 'react';

type ContentWidth = 'wide' | 'standard' | 'reading' | 'full';

const widthMap: Record<ContentWidth, string> = {
  wide: 'max-w-[var(--content-wide,1180px)]',
  standard: 'max-w-[var(--content-standard,960px)]',
  reading: 'max-w-[var(--content-reading,68ch)]',
  full: '',
};

interface ContentShellProps {
  /** Content width variant. Defaults to 'standard'. */
  width?: ContentWidth;
  /** Extra classes appended to the outer div. */
  className?: string;
  /** If true, adds horizontal padding (px-4 sm:px-6 lg:px-8). Default true. */
  padded?: boolean;
  children: ReactNode;
}

/**
 * Shared content-shell: one source of truth for page max‑widths.
 *
 * Variants map to the CSS custom properties defined in globals.css:
 *   wide     → --content-wide  (1180px)
 *   standard → --content-standard (960px)
 *   reading  → --content-reading (68ch)
 *   full     → no width constraint
 */
export function ContentShell({
  width = 'standard',
  className = '',
  padded = true,
  children,
}: ContentShellProps) {
  return (
    <div
      className={`mx-auto ${widthMap[width]} ${padded ? 'px-4 sm:px-6 lg:px-8' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export type { ContentWidth, ContentShellProps };
