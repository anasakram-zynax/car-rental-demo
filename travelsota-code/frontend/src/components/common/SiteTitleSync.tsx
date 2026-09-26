'use client';

// Title/description sync across ALL pages. Next.js re-sets document.title from
// each route's metadata on every client-side navigation, so we must re-apply
// the admin's site title on every route change (and when branding resolves).
// Uses in-place attribute updates only — never removes React-owned <head>
// nodes (that breaks SPA navigation).
//
// Title strategy: the admin's site title is THE brand name — it is used
// verbatim as the document title everywhere. Page-specific metadata titles are
// intentionally overridden, because route metadata still hardcodes the old
// bundled brand ("… | TravelsOTA"), which produced the reported bug: a fixed
// "Travels OTA" prefix next to the favicon no matter what the admin set.
// The admin title is dynamic — it always wins once branding has resolved.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSiteBranding } from '@/components/common/BrandingProvider';

export function SiteTitleSync() {
  const { bundle, ready } = useSiteBranding();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;

    if (bundle.siteTitle) {
      document.title = bundle.siteTitle;
    }

    if (bundle.siteDescription) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', bundle.siteDescription);
    }
  }, [ready, bundle.siteTitle, bundle.siteDescription, pathname]);

  return null;
}
