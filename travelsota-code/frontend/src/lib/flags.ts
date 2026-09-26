/**
 * Master switch for all demo UI surfaces (header CTA, Demo Leads, Reset Console).
 * Set NEXT_PUBLIC_DEMO_UI=false at build time to hide every demo surface across
 * the app — even for the real super admin.
 */
export const DEMO_UI_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_UI !== 'false';
