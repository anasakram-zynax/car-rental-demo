'use client';

// Favicon sync WITHOUT DOM surgery: Next.js App Router owns the <head> <link>
// elements (React-rendered). Removing/re-inserting them detaches React's
// tracked nodes and crashes navigation with `removeChild` on null. So we only
// UPDATE the existing links in place (href + type) once branding resolves.
//
// `seedHref` (the static /favicon.svg, passed from the root layout) seeds the
// metadata icons when branding fails/is absent, so a favicon <link> ALWAYS
// exists (SSR renders it with the seed URL).
//
// Why ALL links: browsers resolve the tab icon from the LAST matching <link>
// when several match. Next.js metadata can render multiple icon links (route
// icons + metadata.icons + file-convention leftovers), so patching only the
// first per rel left the effective (last) link pointing at a stale/default
// URL — the intermittent "default favicon after load" report.
//
// Guard: React 19 hydration can re-write attributes of its tracked nodes and
// revert our in-place href edits (which would fight the effect — React sets
// old value, we set new, React sets old …). We detect that (a link reverting
// to a non-current URL after we've patched) and self-heal via the listener.

import { useEffect } from 'react';
import { useSiteBranding } from '@/components/common/BrandingProvider';

function typeFor(href: string): string {
  if (href.endsWith('.svg')) return 'image/svg+xml';
  if (href.endsWith('.ico')) return 'image/x-icon';
  return 'image/png';
}

function isSameHref(current: string, target: string): boolean {
  if (!current || !target) return false;
  if (current === target) return true;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const currentUrl = new URL(current, origin).href;
    const targetUrl = new URL(target, origin).href;
    return currentUrl === targetUrl;
  } catch {
    return current === target;
  }
}

function patchAll(href: string): void {
  const head = document.head;
  const type = typeFor(href);

  const links = head.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  if (links.length === 0) {
    // React rendered no favicon link at all — append one. This node is not
    // tracked by React, so appending is safe (nothing to detach later).
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = type;
    link.href = href;
    head.appendChild(link);
    return;
  }

  links.forEach((link) => {
    if (link.type !== type) link.type = type;
    if (!isSameHref(link.href, href)) {
      link.href = href;
    }
  });
}

export function FaviconSync({ seedHref }: { seedHref?: string }) {
  const { bundle, ready } = useSiteBranding();
  const favicon = bundle.favicon;

  // Seed: before branding resolves, point every icon link at the static
  // default so there is never a broken/absent icon during load.
  useEffect(() => {
    if (favicon) return; // real value present — skip the seed entirely
    if (!seedHref) return;
    patchAll(seedHref);
    // Runs once on mount; seedHref is a build-time constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real value: patch on branding resolution and on every change.
  useEffect(() => {
    if (!ready || !favicon) return;

    patchAll(favicon);

    // Self-heal against hydration re-renders that revert our in-place edits:
    // if any icon link's href is reverted to a non-current value, re-patch.
    // Guard: isPatching + queueMicrotask prevents infinite microtask loops
    // caused by observer triggering on our own patchAll attribute writes.
    let isPatching = false;
    const observer = new MutationObserver(() => {
      if (isPatching) return;
      const links = document.head.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"]'
      );
      const reverted = Array.from(links).some((l) => !isSameHref(l.href, favicon));
      if (reverted) {
        isPatching = true;
        try {
          patchAll(favicon);
        } finally {
          queueMicrotask(() => {
            isPatching = false;
          });
        }
      }
    });
    observer.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });

    return () => observer.disconnect();
  }, [ready, favicon]);

  return null;
}
