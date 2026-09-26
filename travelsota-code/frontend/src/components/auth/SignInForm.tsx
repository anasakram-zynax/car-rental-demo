"use client";

import { useTranslations } from 'next-intl';
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import React, { useState } from "react";
import { motion } from "motion/react";
import DemoQuickLogin, { matchDemoRole } from "@/features/demo-request/components/DemoQuickLogin";
import { getVisitorId, isUuid } from "@/lib/visitor-id";
import { startDemoSession, saveActiveDemoSession } from "@/features/demo-request/api/demo-sessions";

function validateEmail(v: string, msg = "Enter a valid email address") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : msg;
}

interface SignInFormProps {
  searchParams?: Promise<{ error?: string; message?: string }>;
}

export default function SignInForm({ searchParams }: SignInFormProps) {
  const router = useRouter();
  const urlParams = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Pre-fill email from URL query param (e.g. from demo credentials page)
  React.useEffect(() => {
    const emailParam = urlParams?.get('email');
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [urlParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Display error from Google OAuth redirect
  React.useEffect(() => {
    if (searchParams) {
      searchParams.then((params) => {
        if (params.error === "google" && params.message) {
          setError(decodeURIComponent(params.message));
        }
      });
    }
  }, [searchParams]);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === "email") {
      setFieldErrors((prev) => ({
        ...prev,
        email: email ? validateEmail(email, t('invalidEmail')) : t('emailRequired'),
      }));
    }
    if (field === "password") {
      setFieldErrors((prev) => ({
        ...prev,
        password: password ? "" : t('passwordRequired'),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const emailErr = email ? validateEmail(email, t('invalidEmail')) : t('emailRequired');
    const passErr = password ? "" : t('passwordRequired');
    setFieldErrors({ email: emailErr, password: passErr });
    setTouched({ email: true, password: true });

    if (emailErr || passErr) return;

    setLoading(true);
    try {
      const user = await login({ email, password });
      toast.success(t('welcomeBack'), t('signedInAs', { email: user.email }));

      // Demo session tracking: only fires for the three demo accounts.
      // Fire-and-forget — a tracking failure must never block login.
      const demoRole = matchDemoRole(user.email);
      const visitorId = getVisitorId();
      if (demoRole && isUuid(visitorId)) {
        startDemoSession(visitorId)
          .then((res) => {
            if (res.tracked && res.sessionId) {
              saveActiveDemoSession({
                sessionId: res.sessionId,
                role: demoRole,
                startedAt: Date.now(),
              });
            }
          })
          .catch(() => undefined);
      }

      if (user.userType === "STAFF") {
        router.push("/admin");
      } else if (user.userType === "AGENT") {
        router.push("/agent");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : t('signInFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md mx-auto"
    >
      <Link
        href="/"
        className="group inline-flex items-center gap-1.5 text-sm text-gray-400 transition-all duration-200 hover:text-brand-teal dark:text-gray-500 dark:hover:text-brand-teal-300 mb-10"
      >
        <ChevronLeftIcon className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        {tc('backToHome')}
      </Link>

      <div className="flex flex-col justify-center w-full">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
            {t('welcomeBack')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('signInSubtitle')}
          </p>
        </div>

        <DemoQuickLogin
          onPrefill={(prefillEmail, prefillPassword) => {
            setEmail(prefillEmail);
            setPassword(prefillPassword);
            setError("");
            setFieldErrors({});
          }}
        />

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border border-error-200 bg-error-50/80 px-4 py-3 text-sm text-error-700 backdrop-blur-sm dark:border-error-800/50 dark:bg-error-900/10 dark:text-error-400"
          >
            {error}
          </motion.div>
        )}

        {/* Google sign-in temporarily hidden per product decision — restore
            GoogleOAuthButton + its "or continue with email" divider here. */}

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">
            {/* Email */}
            <div>
              <Label>
                {t('email')} <span className="text-error-500">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 inset-y-0 z-10 flex items-center text-gray-400 dark:text-gray-500">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                </span>
                <Input
                  placeholder={t('emailPlaceholder')}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (touched.email)
                      setFieldErrors((prev) => ({
                        ...prev,
                        email: validateEmail(e.target.value, t('invalidEmail')),
                      }));
                  }}
                  onBlur={() => handleBlur("email")}
                  error={touched.email ? !!fieldErrors.email : false}
                  required
                  autoComplete="email"
                  className="pl-10"
                />
              </div>
              {touched.email && fieldErrors.email ? (
                <p className="mt-1.5 text-xs text-error-500">{fieldErrors.email}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  {t('emailHint')}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <Label>
                {t('password')} <span className="text-error-500">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 inset-y-0 z-10 flex items-center text-gray-400 dark:text-gray-500">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                </span>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (touched.password)
                      setFieldErrors((prev) => ({
                        ...prev,
                        password: e.target.value ? "" : t('passwordRequired'),
                      }));
                  }}
                  onBlur={() => handleBlur("password")}
                  error={touched.password ? !!fieldErrors.password : false}
                  required
                  autoComplete="current-password"
                  className="pl-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 inset-y-0 z-10 flex items-center cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  tabIndex={-1}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? (
                    <EyeIcon className="h-5 w-5" />
                  ) : (
                    <EyeCloseIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
              {touched.password && fieldErrors.password ? (
                <p className="mt-1.5 text-xs text-error-500">{fieldErrors.password}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  {t('passwordHint')}
                </p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox checked={isChecked} onChange={setIsChecked} />
                <span className="block text-sm text-gray-600 dark:text-gray-400">
                  {t('keepMeLoggedIn')}
                </span>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-brand-teal hover:text-brand-teal-600 transition-colors dark:text-brand-teal-300 dark:hover:text-brand-teal-200"
              >
                {t('forgotPassword')}
              </Link>
            </div>

            {/* Submit */}
            <div>
              <Button className="w-full" size="sm" disabled={loading}>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t('signingIn')}
                  </span>
                ) : (
                  t('signIn')
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
