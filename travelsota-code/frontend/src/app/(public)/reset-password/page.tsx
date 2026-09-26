'use client';

import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useResetPassword, useVerifyResetToken } from '@/features/account/hooks/use-account';
import { PasswordInput } from '@/components/ui/password-input';
import Button from '@/components/ui/button/Button';

function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const { data: tokenData, isLoading: verifying } = useVerifyResetToken(token);
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  const validate = () => {
    const errs: typeof errors = {};
    if (!password) {
      errs.password = t('passwordRequired');
    } else if (password.length < 8) {
      errs.password = t('resetPasswordMinLength');
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errs.password = t('resetPasswordComplexity');
    }
    if (password !== confirmPassword) {
      errs.confirm = t('passwordsDoNotMatch');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      await resetPassword.mutateAsync({ token, newPassword: password });
      setDone(true);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : t('resetFailed');
      setErrors({ password: msg });
    }
  };

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('invalidLinkTitle')}</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('invalidLinkDesc')}</p>
        <Link href="/forgot-password" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal-600 dark:text-brand-teal-300 dark:hover:text-brand-teal-200">
          {t('requestNewLink')}
        </Link>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal" />
      </div>
    );
  }

  if (tokenData && !tokenData.valid) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/15">
          <svg className="h-8 w-8 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('linkExpiredTitle')}</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('linkExpiredDesc')}</p>
        <Link href="/forgot-password" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal-600 dark:text-brand-teal-300 dark:hover:text-brand-teal-200">
          {t('requestNewLink')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('passwordResetTitle')}</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('passwordResetDesc')}</p>
        <Link href="/signin" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#012830]">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-brand-teal dark:text-slate-500 dark:hover:text-brand-teal-300">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
        {tc('backToHome')}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('setNewPasswordTitle')}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {t('setNewPasswordDesc')}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <PasswordInput label={t('newPasswordLabel')} value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} error={errors.password} placeholder={t('newPasswordPlaceholder')} autoComplete="new-password" />
        <PasswordInput label={t('confirmPasswordLabel')} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }} error={errors.confirm} placeholder={t('confirmPasswordPlaceholder')} autoComplete="new-password" />

        <Button size="sm" className="w-full" disabled={resetPassword.isPending}>
          {resetPassword.isPending ? t('resetting') : t('resetPasswordButton')}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
