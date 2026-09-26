'use client';
import { useTranslations } from 'next-intl';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/api/client';

// ─── Inline SVG Icons ─────────────────────────────────────

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ─── Profile Response Type ────────────────────────────────

interface ProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  userType: string;
  role: string | null;
  permissions: string[];
  createdAt: string;
}

// ─── Main Page ─────────────────────────────────────────────

export default function MyProfilePage() {
  const t = useTranslations('Account');
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // ── Profile Query ──────────────────────────────────────
  const { data: profile, isPending } = useQuery<ProfileResponse>({
    queryKey: ['customer', 'profile'],
    queryFn: () => apiRequest<ProfileResponse>('/auth/me', { auth: true }),
    enabled: isAuthenticated,
  });

  // Redirect if not authenticated
  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  // ── Render ─────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || t('userFallback');
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('myProfileTitle')}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('profileSubtitle')}
        </p>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {/* Avatar + Name Section */}
        <div className="flex flex-col items-center border-b border-gray-100 px-6 py-10 dark:border-gray-800">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-2xl font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            {(profile?.firstName?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()}
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{displayName}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              profile?.status === 'ACTIVE'
                ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'
                : 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400'
            }`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                profile?.status === 'ACTIVE' ? 'bg-success-500' : 'bg-warning-500'
              }`} />
              {profile?.status === 'ACTIVE' ? t('activeBadge') : profile?.status || t('unknownValue')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {profile?.userType === 'CUSTOMER' ? t('customerBadge') : profile?.userType || t('userFallback')}
            </span>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid gap-6 p-6 sm:grid-cols-2">
          {/* Email */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <MailIcon className="size-4" />
              <span className="font-medium">{t('emailLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
              {profile?.email || '—'}
            </p>
          </div>

          {/* Name */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <UserIcon className="size-4" />
              <span className="font-medium">{t('fullNameLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
              {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—'}
            </p>
          </div>

          {/* Phone */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span className="font-medium">{t('phoneLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
              {profile?.phone || t('phoneNotSet')}
            </p>
          </div>

          {/* Member Since */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <CalendarIcon className="size-4" />
              <span className="font-medium">{t('memberSinceLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
              {memberSince}
            </p>
          </div>

          {/* Account Type */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <ShieldIcon className="size-4" />
              <span className="font-medium">{t('accountTypeLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium capitalize text-gray-900 dark:text-white">
              {profile?.userType?.toLowerCase() || '—'}
            </p>
          </div>

          {/* Role */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" />
              </svg>
              <span className="font-medium">{t('roleLabel')}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
              {profile?.role || t('standardRole')}
            </p>
          </div>
        </div>
      </div>

      {/* Preferences Section (placeholder for future) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('preferencesTitle')}</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('preferencesComingSoon')}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{t('comingSoonNote')}</span>
        </div>
      </div>
    </div>
  );
}
