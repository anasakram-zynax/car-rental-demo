'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useChangePassword } from '@/features/account/hooks/use-account';
import { useToast } from '@/hooks/useToast';
import { PasswordInput } from '@/components/ui/password-input';
import Button from '@/components/ui/button/Button';

interface ProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  userType: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { user, logout, logoutAll } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const changePassword = useChangePassword();

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwErrors, setPwErrors] = useState<{ current?: string; newPw?: string; confirm?: string }>({});
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const { data: profile } = useQuery<ProfileResponse>({
    queryKey: ['customer', 'profile'],
    queryFn: () => apiRequest<ProfileResponse>('/auth/me', { auth: true }),
  });

  const handleSignOut = async () => {
    await logout();
    router.push('/');
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await logoutAll();
      toast.success('All sessions ended', 'Signed out from all devices.');
      router.push('/');
    } catch {
      toast.error('Failed', 'Could not sign out of all sessions.');
      setLoggingOutAll(false);
    }
  };

  const validatePassword = () => {
    const errs: typeof pwErrors = {};
    if (!pwForm.currentPassword) errs.current = 'Current password is required';
    if (!pwForm.newPassword) {
      errs.newPw = 'New password is required';
    } else if (pwForm.newPassword.length < 8) {
      errs.newPw = 'Must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pwForm.newPassword)) {
      errs.newPw = 'Must contain uppercase, lowercase, and a number';
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) errs.confirm = 'Passwords do not match';
    setPwErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    try {
      await changePassword.mutateAsync({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Password changed', 'Your password has been updated.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwErrors({});
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Failed to change password';
      setPwErrors({ current: msg });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Manage your account and preferences</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Account</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="font-medium text-slate-900 dark:text-white">{profile?.email ?? user?.email}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Account type</dt>
            <dd className="font-medium capitalize text-slate-900 dark:text-white">{profile?.userType?.toLowerCase() ?? 'customer'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Status</dt>
            <dd className="font-medium text-slate-900 dark:text-white">{profile?.status ?? 'Active'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Change password</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update your account password. After changing, all other sessions will be signed out.</p>
        <form onSubmit={handleChangePassword} className="mt-5 max-w-md space-y-4">
          <PasswordInput label="Current password" value={pwForm.currentPassword} onChange={(e) => { setPwForm((p) => ({ ...p, currentPassword: e.target.value })); setPwErrors((p) => ({ ...p, current: undefined })); }} error={pwErrors.current} placeholder="Enter current password" autoComplete="current-password" />
          <PasswordInput label="New password" value={pwForm.newPassword} onChange={(e) => { setPwForm((p) => ({ ...p, newPassword: e.target.value })); setPwErrors((p) => ({ ...p, newPw: undefined })); }} error={pwErrors.newPw} placeholder="At least 8 characters" autoComplete="new-password" />
          <PasswordInput label="Confirm new password" value={pwForm.confirmPassword} onChange={(e) => { setPwForm((p) => ({ ...p, confirmPassword: e.target.value })); setPwErrors((p) => ({ ...p, confirm: undefined })); }} error={pwErrors.confirm} placeholder="Re-enter new password" autoComplete="new-password" />
          <Button size="sm" disabled={changePassword.isPending}>
            {changePassword.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Preferences</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Notification and travel preferences are coming soon. You&apos;ll be able to manage email and notification settings here.</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <span>Coming soon</span>
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6 dark:border-rose-900/40 dark:bg-rose-950/10">
        <h3 className="text-base font-semibold text-rose-700 dark:text-rose-400">Sign out</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">End your session on this device.</p>
        <button onClick={handleSignOut} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Sign out
        </button>
        <div className="mt-5 border-t border-rose-200/60 pt-5 dark:border-rose-900/30">
          <p className="text-sm text-slate-500 dark:text-slate-400">Sign out from all devices and browsers.</p>
          <button onClick={handleLogoutAll} disabled={loggingOutAll} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-slate-800">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            {loggingOutAll ? 'Signing out…' : 'Sign out all devices'}
          </button>
        </div>
      </section>
    </div>
  );
}
