'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrency, formatCurrencyWithCode } from '@/lib/utils/currency';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { DashboardCard } from '@/components/dashboards/dashboard-card';
import { PencilIcon } from '@/icons';

interface AgentMarkupRule {
  id: string;
  name: string;
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  currency?: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  isActive: boolean;
}

interface AgentProfileData {
  id: string;
  userId: string;
  companyName: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  taxId: string | null;
  creditLimit: number;
  creditUsed: number;
  walletBalance: number;
  commissionRate: number;
  flightMarkup: number;
  hotelMarkup: number;
  kycStatus: string;
  isApproved: boolean;
  isSuspended: boolean;
  createdAt: string;
}

interface AgentSelfProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: string;
  status: string;
  roleName: string | null;
  agentProfile: AgentProfileData | null;
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export default function AgentProfilePage() {
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();
  const toast = useToast();

  const { data: profile, isPending } = useQuery<AgentSelfProfile>({
    queryKey: ['agent', 'profile'],
    queryFn: () => apiRequest<AgentSelfProfile>('/agents/profile', { auth: true }),
  });

  const { data: markupRules } = useQuery<AgentMarkupRule[]>({
    queryKey: ['agent', 'markup-rules'],
    queryFn: () => apiRequest<AgentMarkupRule[]>('/agents/markup-rules', { auth: true }),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    companyName: '', companyPhone: '', companyAddress: '', taxId: '',
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest('/agents/profile', {
        method: 'PATCH',
        body: data,
        auth: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'profile'] });
      setEditing(false);
      toast.success('Profile updated', 'Your profile has been saved.');
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const startEditing = () => {
    const p = profile?.agentProfile;
    setForm({
      companyName: p?.companyName ?? '',
      companyPhone: p?.companyPhone ?? '',
      companyAddress: p?.companyAddress ?? '',
      taxId: p?.taxId ?? '',
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  if (isPending) {
    return (
      <div className="space-y-5">
        <AdminPageHeader title="My Profile" description="Your account, company and pricing." />
        <div className="h-80 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  const ap = profile?.agentProfile;
  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Agent';

  const statusConfig = {
    APPROVED: { label: 'Approved', bg: 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400', dot: 'bg-success-500' },
    REJECTED: { label: 'Rejected', bg: 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400', dot: 'bg-error-500' },
    PENDING: { label: 'Pending review', bg: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400', dot: 'bg-warning-500' },
  }[(ap?.kycStatus ?? 'PENDING') as 'APPROVED' | 'REJECTED' | 'PENDING'] ?? {
    label: 'Pending review', bg: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400', dot: 'bg-warning-500',
  };

  const creditLimit = ap?.creditLimit ?? 0;
  const creditUsed = ap?.creditUsed ?? 0;
  const creditAvailable = Math.max(creditLimit - creditUsed, 0);
  // ponytail: wallet currency not exposed on self profile, USD fallback
  const wCur = 'USD';
  const wmt = (v: number | null | undefined) => formatCurrencyWithCode(v ?? 0, wCur, decimalsMap);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="My Profile"
        description="Your account, company details and pricing."
        root={{ label: 'Agent', href: '/agent' }}
        breadcrumbs={[{ label: 'Profile' }]}
        actions={
          !editing ? (
            <button
              onClick={startEditing}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600"
            >
              <PencilIcon className="size-4" />
              Edit Profile
            </button>
          ) : undefined
        }
      />

      {/* ── Hero header: identity + key facts ───────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-teal-50 text-xl font-semibold text-brand-teal-600 dark:bg-brand-teal-900/30 dark:text-brand-teal-400">
            {(profile?.firstName?.[0] ?? profile?.email?.[0] ?? 'A').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{displayName}</h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.bg}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                ap?.isSuspended
                  ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${ap?.isSuspended ? 'bg-error-500' : 'bg-success-500'}`} />
                {ap?.isSuspended ? 'Suspended' : 'Active'}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
              {profile?.email}
              {ap?.companyName ? <> · {ap.companyName}</> : null}
              {profile?.roleName ? <> · {profile.roleName.replace(/_/g, ' ')}</> : null}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4 dark:border-gray-800">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Wallet balance</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">{wmt(ap?.walletBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Credit available</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {wmt(creditAvailable)}
              <span className="ml-1 text-xs font-normal text-gray-400">of {wmt(creditLimit)}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Commission rate</p>
            <p className="mt-0.5 text-lg font-bold text-brand-teal-600 dark:text-brand-teal-400">{ap?.commissionRate ?? 0}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Member since</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
              {ap?.createdAt ? new Date(ap.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Account */}
        <DashboardCard title="Account" period="Contact and account status" contentClassName="px-6 pb-6">
          <div className="space-y-3">
            {[
              ['Email', profile?.email || '—'],
              ['Phone', profile?.phone || '—'],
              ['Account type', 'Agent'],
              ['Role', profile?.roleName ? profile.roleName.replace(/_/g, ' ') : 'None assigned'],
              ['Status', profile?.status || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{label}</span>
                <span className="truncate font-medium text-gray-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Company & KYC */}
        <DashboardCard
          title="Company & KYC"
          period="Registration details and verification"
          contentClassName="px-6 pb-6"
          action={
            editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="cursor-pointer rounded-xl bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : undefined
          }
        >
          {!editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Company Name</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ap?.companyName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tax ID / VAT</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ap?.taxId || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Company Phone</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ap?.companyPhone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">KYC Status</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{statusConfig.label}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Company Address</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ap?.companyAddress || '—'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Company Name</label>
                <input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputClass} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Company Phone</label>
                  <input type="text" value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Tax ID</label>
                  <input type="text" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Company Address</label>
                <textarea value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} rows={2} className={inputClass} />
              </div>
            </div>
          )}
        </DashboardCard>

        {/* Settings */}
        <DashboardCard title="Settings" period="Your pricing and markup rules" contentClassName="px-6 pb-6" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Flight Markup</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{(ap?.flightMarkup ?? 0).toFixed(2)}%</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Hotel Markup</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{(ap?.hotelMarkup ?? 0).toFixed(2)}%</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">My Markup Rules</h4>
            {markupRules && markupRules.length > 0 ? (
              <div className="mt-3 space-y-2">
                {markupRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3">
                      <span className={`inline-block h-2 w-2 rounded-full ${rule.isActive ? 'bg-success-500' : 'bg-gray-400'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</p>
                        <p className="text-xs text-gray-400">
                          {rule.applyTo === 'all' ? 'All products' : rule.applyTo}
                          {rule.routeFrom ? ` · ${rule.routeFrom}→${rule.routeTo}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-brand-teal-600 dark:text-brand-teal-400">
                      {rule.markupType === 'percentage' ? `${rule.markupValue}%` : `${formatCurrency(rule.markupValue, rule.currency ?? 'USD', decimalsMap)} ${rule.currency ?? 'USD'}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-gray-400">No markup rules configured for your account. Contact your admin.</p>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
