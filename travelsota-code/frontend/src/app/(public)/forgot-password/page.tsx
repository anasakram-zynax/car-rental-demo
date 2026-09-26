'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useForgotPassword } from '@/features/account/hooks/use-account';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button/Button';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgotPassword.mutateAsync({ email });
    } catch {
      // Silently ignore errors to prevent email enumeration
    } finally {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('checkYourEmail')}</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t.rich('checkEmailDesc', { email, strong: (chunks) => <strong className="text-slate-700 dark:text-slate-200">{chunks}</strong> })}
        </p>
        <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
          {t('resetLinkExpiry')}
        </p>
        <Link href="/signin" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:text-brand-teal-600 dark:text-brand-teal-300 dark:hover:text-brand-teal-200">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
          {t('backToSignIn')}
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

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('forgotPasswordTitle')}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {t('forgotPasswordDesc')}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Input label={t('emailAddress')} type="email" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />

        <Button size="sm" className="w-full" disabled={forgotPassword.isPending}>
          {forgotPassword.isPending ? t('sending') : t('sendResetLink')}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('rememberPassword')}{' '}
        <Link href="/signin" className="font-semibold text-brand-teal hover:text-brand-teal-600 dark:text-brand-teal-300 dark:hover:text-brand-teal-200">
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
