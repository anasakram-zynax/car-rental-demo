'use client';

import { useEffect, useState } from 'react';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

/**
 * Detects low-bandwidth / data-saving conditions so heavy hero animation can be
 * skipped. On slow connections the hero falls back to a clean, static image —
 * no flight-radar layer, no extra images preloaded.
 *
 * Checks (any one → reduced):
 *  - `prefers-reduced-data: reduce` media query
 *  - Network Information API: `saveData`, `effectiveType` (slow-2g / 2g), low `downlink`
 */
function detectSlowConnection(): boolean {
  if (typeof window === 'undefined') return false;

  const media = window.matchMedia('(prefers-reduced-data: reduce)');
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  const effectiveType = connection?.effectiveType;

  return (
    media.matches ||
    connection?.saveData === true ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    (typeof connection?.downlink === 'number' && connection.downlink < 0.5)
  );
}

export function useReducedData(): boolean {
  // Synchronous initial value (no flash of animation on slow connections).
  const [reduced, setReduced] = useState<boolean>(detectSlowConnection);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-data: reduce)');
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

    const onChange = () => setReduced(detectSlowConnection());
    media.addEventListener?.('change', onChange);
    connection?.addEventListener?.('change', onChange);

    return () => {
      media.removeEventListener?.('change', onChange);
      connection?.removeEventListener?.('change', onChange);
    };
  }, []);

  return reduced;
}
