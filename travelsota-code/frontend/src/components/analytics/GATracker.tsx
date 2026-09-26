"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fires a `gtag` pageview on every client-side route change (App Router
 * navigations don't reload the document, so the <head> snippet alone only
 * reports the initial page load). Mounted once in the root layout.
 */
export function GATracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mounted = useRef(false);

  useEffect(() => {
    // Skip the first run — the initial load is already counted by the head snippet,
    // and this effect would otherwise double-fire on hydration.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    window.gtag("config", "G-ZC4NKKHQXH", { page_path: url });
    window.gtag("event", "page_view", { page_location: url, page_title: document.title });
  }, [pathname, searchParams]);

  return null;
}