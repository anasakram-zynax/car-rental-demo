'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  submitDemoRequest, type DemoCredentials,
  saveLeadSession, getLeadSession, clearLeadSession,
} from '@/features/demo-request/api/submit-demo-request';
import type { ApiError } from '@/lib/api/client';

export function DemoRequestModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const tCommon = useTranslations('Common');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [emailError, setEmailError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resume session from localStorage if available
  useEffect(() => {
    if (isOpen) {
      const session = getLeadSession();
      if (session) {
        setEmail(session.email || '');
        setName(session.name || '');
        setCompanyName(session.companyName || '');
        setWhatsappNumber(session.whatsappNumber || '');
      }
    }
  }, [isOpen]);

  const reset = () => {
    setEmail('');
    setName('');
    setCompanyName('');
    setWhatsappNumber('');
    setEmailError('');
    setGeneralError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setGeneralError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError(tCommon('demoEmailRequired'));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError(tCommon('demoEmailInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitDemoRequest({
        email: trimmedEmail,
        name: name.trim() || undefined,
        companyName: companyName.trim() || undefined,
        whatsappNumber: whatsappNumber.trim() || undefined,
      });

      // Save session so user can resume if they come back
      saveLeadSession({
        requestId: result.requestId,
        email: trimmedEmail,
        name: name.trim() || undefined,
        companyName: companyName.trim() || undefined,
        whatsappNumber: whatsappNumber.trim() || undefined,
      });

      router.push(`/demo-credentials?rid=${result.requestId}`);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setGeneralError(apiErr?.message ?? tCommon('demoGenericError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 z-0 bg-black/45 backdrop-blur-sm" onClick={handleClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-[0_32px_80px_rgba(3,61,74,0.22)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors"
          aria-label={tCommon('close')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="bg-gradient-to-br from-brand-teal to-[#0a5a6b] px-8 py-8 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white mb-4">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5L21 12 3.5 4.5 6 12l-2.5 7.5Z" />
            </svg>
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight">{tCommon('demoModalTitle')}</h2>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">{tCommon('demoModalDesc')}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          <div>
            <label htmlFor="demo-email" className="block text-sm font-semibold text-zinc-700 mb-1.5">
              {tCommon('demoEmailSr')} <span className="text-brand-teal">*</span>
            </label>
            <input
              id="demo-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
              placeholder={tCommon('demoEmailPlaceholder')}
              disabled={submitting}
              className={`w-full rounded-xl border px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal ${
                emailError ? 'border-red-300 bg-red-50' : 'border-zinc-200'
              } disabled:bg-zinc-50`}
              autoFocus
              autoComplete="email"
            />
            {emailError && <p className="mt-1.5 text-xs text-red-600">{emailError}</p>}
          </div>

          <div>
            <label htmlFor="demo-name" className="block text-sm font-semibold text-zinc-700 mb-1.5">{tCommon('demoFullName')}</label>
            <input
              id="demo-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              disabled={submitting}
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal transition-colors disabled:bg-zinc-50"
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="demo-company" className="block text-sm font-semibold text-zinc-700 mb-1.5">{tCommon('demoCompanyName')}</label>
            <input
              id="demo-company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Travel Inc."
              disabled={submitting}
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal transition-colors disabled:bg-zinc-50"
              autoComplete="organization"
            />
          </div>

          <div>
            <label htmlFor="demo-whatsapp" className="block text-sm font-semibold text-zinc-700 mb-1.5">
              {tCommon('demoWhatsappLabel')} <span className="text-zinc-400 font-normal">{tCommon('demoOptionalSuffix')}</span>
            </label>
            <input
              id="demo-whatsapp"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+971 50 123 4567"
              disabled={submitting}
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal transition-colors disabled:bg-zinc-50"
              autoComplete="tel"
            />
          </div>

          {generalError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">{generalError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-brand-teal to-[#0a5a6b] py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-teal/25 hover:shadow-brand-teal/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {tCommon('demoGettingCredentials')}
              </span>
            ) : (
              tCommon('demoGetCredentials')
            )}
          </button>

          <p className="text-[11px] text-zinc-400 text-center">
            {tCommon('demoInstantAccessNote')}
          </p>
        </form>
      </motion.div>
    </div>
  );
}
