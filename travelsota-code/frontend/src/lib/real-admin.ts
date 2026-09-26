/**
 * Single source of truth for real-admin surfaces (Demo Leads, Reset Console).
 * The tabs exist for exactly ONE account — the email in
 * NEXT_PUBLIC_REAL_ADMIN_EMAIL (fallback superadmin@travelsota-dev.local).
 * Everyone else, regardless of role or permissions, does not see them.
 *
 * NOTE: NEXT_PUBLIC_* values are baked at build time — set the variable
 * before `npm run build` when rotating the admin email.
 */
export const REAL_ADMIN_EMAIL =
  (process.env.NEXT_PUBLIC_REAL_ADMIN_EMAIL ?? 'superadmin@travelsota-dev.local').trim().toLowerCase();

export function isRealSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === REAL_ADMIN_EMAIL;
}
