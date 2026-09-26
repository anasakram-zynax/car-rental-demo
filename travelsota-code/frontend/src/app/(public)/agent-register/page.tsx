'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiRequest } from '@/lib/api/client';
import { ChevronLeftIcon } from '@/icons';

type Step = 'company' | 'contact' | 'credentials' | 'success';

interface FormData {
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  taxId: string;
  contactName: string;
  email: string;
  password: string;
}

function validateEmail(v: string, msg = 'Enter a valid email address') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : msg;
}

function validatePassword(
  v: string,
  msgs = {
    required: 'Password is required',
    minLength: 'At least 8 characters required',
    uppercase: 'Add at least one uppercase letter',
    number: 'Add at least one number',
  },
) {
  if (!v) return msgs.required;
  if (v.length < 8) return msgs.minLength;
  if (!/[A-Z]/.test(v)) return msgs.uppercase;
  if (!/[0-9]/.test(v)) return msgs.number;
  return '';
}

const REQUIREMENTS = [
  { key: 'reqMinLength', test: (v: string) => v.length >= 8 },
  { key: 'reqUppercase', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'reqNumber', test: (v: string) => /[0-9]/.test(v) },
];

function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations('Auth');
  const met = REQUIREMENTS.filter((r) => r.test(value)).length;
  const pct = value ? Math.round((met / REQUIREMENTS.length) * 100) : 0;
  let barColor = 'bg-gray-300 dark:bg-gray-600';
  let bgColor = 'bg-gray-200 dark:bg-gray-700';
  if (value && pct <= 33) { barColor = 'bg-error-500'; bgColor = 'bg-error-200 dark:bg-error-900/30'; }
  else if (pct <= 66) { barColor = 'bg-amber-500'; bgColor = 'bg-amber-200 dark:bg-amber-900/30'; }
  else if (pct === 100) { barColor = 'bg-success-500'; bgColor = 'bg-success-200 dark:bg-success-900/30'; }
  return (
    <div className="mt-2">
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${bgColor}`}>
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {REQUIREMENTS.map((r) => {
          const ok = r.test(value);
          const label = t(r.key);
          return (
            <span key={r.key} className={`inline-flex items-center gap-1 text-xs ${ok ? 'text-success-600 dark:text-success-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                {ok ? (
                  <path d="M10.28 2.72a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06 0L1.22 6.28a.75.75 0 011.06-1.06L4.5 7.44l4.72-4.72a.75.75 0 011.06 0z" />
                ) : (
                  <path d="M6 1.5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 016 1.5zm0 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                )}
              </svg>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StepIndicator({ current, steps }: { current: number; steps: { label: string; icon: string }[] }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
            i <= current
              ? 'bg-brand-teal text-white shadow-md shadow-brand-teal-200 dark:shadow-brand-teal-900/30'
              : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
          }`}>
            {i < current ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              s.icon
            )}
          </div>
          <span className={`hidden text-sm font-medium sm:inline ${i <= current ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`hidden h-px w-8 sm:block ${i < current ? 'bg-brand-teal' : 'bg-gray-200 dark:bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function AgentRegisterPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const [step, setStep] = useState<Step>('company');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormData>({
    companyName: '', companyPhone: '', companyAddress: '', taxId: '',
    contactName: '', email: '', password: '',
  });

  const update = (field: keyof FormData, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const passwordMsgs = {
    required: t('passwordRequired'),
    minLength: t('passwordMinLength'),
    uppercase: t('passwordUppercase'),
    number: t('passwordNumber'),
  };

  const stepIndex = { company: 0, contact: 1, credentials: 2, success: 3 }[step];
  const steps = [
    { label: t('stepCompany'), icon: '1' },
    { label: t('stepContact'), icon: '2' },
    { label: t('stepCredentials'), icon: '3' },
  ];

  const canContinueCompany = form.companyName.trim().length > 0;
  const canContinueContact = form.contactName.trim().length > 0 && form.email.trim().length > 0 && !validateEmail(form.email, t('invalidEmail'));

  const handleSubmit = async () => {
    setError('');
    const pwErr = validatePassword(form.password, passwordMsgs);
    if (pwErr) { setError(pwErr); return; }
    setLoading(true);
    try {
      await apiRequest('/auth/agent/register', {
        method: 'POST',
        body: form,
      });
      setStep('success');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('agentRegistrationFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-900 dark:to-gray-950">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20">
              <svg className="h-8 w-8 text-success-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('registrationSubmittedTitle')}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('registrationSubmittedDesc')}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href="/signin" className="inline-flex items-center justify-center rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#012830]">
                {t('signIn')}
              </Link>
              <Link href="/" className="inline-flex items-center justify-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <ChevronLeftIcon className="size-4" /> {tc('backToHome')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ChevronLeftIcon className="size-4" /> {tc('backToHome')}
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{t('becomeAgentTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('becomeAgentSubtitle')}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <StepIndicator current={stepIndex} steps={steps} />
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900 sm:p-8">
          {error && (
            <div className="mb-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
              {error}
            </div>
          )}

          {step === 'company' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('companyInfoTitle')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('companyInfoDesc')}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('companyName')} *</label>
                <input type="text" value={form.companyName} onChange={(e) => update('companyName', e.target.value)}
                  placeholder={t('companyNamePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('companyPhone')}</label>
                <input type="tel" value={form.companyPhone} onChange={(e) => update('companyPhone', e.target.value)}
                  placeholder={t('companyPhonePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('companyAddress')}</label>
                <textarea value={form.companyAddress} onChange={(e) => update('companyAddress', e.target.value)}
                  placeholder={t('companyAddressPlaceholder')} rows={2}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('taxId')}</label>
                <input type="text" value={form.taxId} onChange={(e) => update('taxId', e.target.value)}
                  placeholder={t('taxIdPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={() => setStep('contact')} disabled={!canContinueCompany}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-50">
                  {tc('continue')}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {step === 'contact' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('contactDetailsTitle')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('contactDetailsDesc')}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('contactName')} *</label>
                <input type="text" value={form.contactName} onChange={(e) => update('contactName', e.target.value)}
                  placeholder={t('contactNamePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('emailAddress')} *</label>
                <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)}
                  placeholder={t('agencyEmailPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
                {form.email && validateEmail(form.email, t('invalidEmail')) && (
                  <p className="mt-1 text-xs text-error-500">{validateEmail(form.email, t('invalidEmail'))}</p>
                )}
              </div>
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('company')}
                  className="inline-flex cursor-pointer items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {tc('back')}
                </button>
                <button onClick={() => setStep('credentials')} disabled={!canContinueContact}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-50">
                  {tc('continue')}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {step === 'credentials' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('setPasswordTitle')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('setPasswordDesc')}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('password')} *</label>
                <div className="relative">
                  <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)}
                    placeholder={t('createPasswordPlaceholder')}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30" />
                </div>
                {form.password && <PasswordStrength value={form.password} />}
              </div>
              <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-700 dark:bg-brand-950/30 dark:text-brand-400">
                <p className="font-medium">{t('whatHappensNext')}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  <li>{t('nextImmediate')}</li>
                  <li>{t('nextReview')}</li>
                  <li>{t('nextEmail')}</li>
                  <li>{t('nextSignIn')}</li>
                </ul>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('contact')}
                  className="inline-flex cursor-pointer items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {tc('back')}
                </button>
                <button onClick={handleSubmit} disabled={loading || !form.password}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('submitting')}
                    </span>
                  ) : (
                    t('submitRegistration')
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/signin" className="font-semibold text-brand-500 hover:text-brand-600 dark:text-brand-400">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
