"use client";

import { useTranslations } from 'next-intl';
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { apiRequest } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import React, { useState } from "react";
import { motion } from "motion/react";

function validateEmail(v: string, msg = "Enter a valid email address") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : msg;
}

function validatePassword(
  v: string,
  msgs = {
    required: "Password is required",
    minLength: "At least 8 characters required",
    uppercase: "Add at least one uppercase letter",
    number: "Add at least one number",
  },
) {
  if (!v) return msgs.required;
  if (v.length < 8) return msgs.minLength;
  if (!/[A-Z]/.test(v)) return msgs.uppercase;
  if (!/[0-9]/.test(v)) return msgs.number;
  return "";
}

const PASSWORD_TESTS = [
  { key: "reqMinLength", test: (v: string) => v.length >= 8 },
  { key: "reqUppercase", test: (v: string) => /[A-Z]/.test(v) },
  { key: "reqNumber", test: (v: string) => /[0-9]/.test(v) },
];

function PasswordStrengthBar({ value }: { value: string }) {
  const t = useTranslations('Auth');
  const PASSWORD_REQUIREMENTS = PASSWORD_TESTS.map((r) => ({ label: t(r.key), test: r.test }));
  const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(value)).length;
  const pct = value ? Math.round((met / PASSWORD_REQUIREMENTS.length) * 100) : 0;

  let bgColor = "bg-gray-200 dark:bg-gray-700";
  let barColor = "bg-gray-300 dark:bg-gray-600";
  if (value && pct <= 33) {
    bgColor = "bg-error-100 dark:bg-error-900/20";
    barColor = "bg-error-500";
  } else if (pct <= 66) {
    bgColor = "bg-amber-100 dark:bg-amber-900/20";
    barColor = "bg-amber-500";
  } else if (pct === 100) {
    bgColor = "bg-success-100 dark:bg-success-900/20";
    barColor = "bg-success-500";
  }

  return (
    <div className="mt-3">
      <div className={`h-1 w-full overflow-hidden rounded-full ${bgColor}`}>
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {PASSWORD_REQUIREMENTS.map((req) => {
          const ok = req.test(value);
          return (
            <span
              key={req.label}
              className={`inline-flex items-center gap-1.5 text-xs ${
                ok
                  ? "text-success-600 dark:text-success-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                {ok ? (
                  <path d="M10.28 2.72a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06 0L1.22 6.28a.75.75 0 011.06-1.06L4.5 7.44l4.72-4.72a.75.75 0 011.06 0z" />
                ) : (
                  <path d="M6 1.5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 016 1.5zm0 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                )}
              </svg>
              {req.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface SignUpFormProps {
  role?: "customer" | "agent";
  searchParams?: Promise<{ error?: string; message?: string }>;
}

export default function SignUpForm({ role = "customer", searchParams }: SignUpFormProps) {
  const router = useRouter();
  const { register, hydrateUser } = useAuth();
  const toast = useToast();
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const passwordMsgs = {
    required: t('passwordRequired'),
    minLength: t('passwordMinLength'),
    uppercase: t('passwordUppercase'),
    number: t('passwordNumber'),
  };
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isAgent = role === "agent";

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
    switch (field) {
      case "email":
        setFieldErrors((prev) => ({
          ...prev,
          email: email ? validateEmail(email, t('invalidEmail')) : t('emailRequired'),
        }));
        break;
      case "password":
        setFieldErrors((prev) => ({
          ...prev,
          password: validatePassword(password, passwordMsgs),
        }));
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const emailErr = email ? validateEmail(email, t('invalidEmail')) : t('emailRequired');
    const passErr = validatePassword(password, passwordMsgs);
    const termsErr = !isChecked ? t('acceptTermsRequired') : "";

    setFieldErrors((prev) => ({ ...prev, email: emailErr, password: passErr }));
    setTouched({ email: true, password: true });

    if (emailErr || passErr || termsErr) {
      if (termsErr) setError(termsErr);
      return;
    }

    setLoading(true);
    try {
      if (isAgent) {
        const res = await apiRequest<{
          user: {
            id: string;
            email: string;
            firstName: string | null;
            userType: string;
            role: string | null;
            permissions: string[];
          };
          accessToken: string;
          refreshToken: string;
        }>("/auth/agent/register", {
          method: "POST",
          body: {
            companyName: `${firstName || "Travel"}'s Agency`,
            contactName: `${firstName || ""} ${lastName || ""}`.trim(),
            email,
            password,
            acceptTerms: true,
          },
        });
        hydrateUser(res.user);
        toast.success(t('agentAccountCreated'), t('agentWelcomeDesc'));
        router.push("/agent");
      } else {
        await register({
          email,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          acceptTerms: true,
        });
        toast.success(t('accountCreated'), t('customerWelcomeDesc'));
        router.push("/");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : t('registrationFailed');
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
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              {isAgent ? t('agentAccountTitle') : t('createAccount')}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isAgent
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                  : "bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-900/20 dark:text-brand-teal-300"
              }`}
            >
              {isAgent ? t('agentBadge') : t('customerBadge')}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isAgent
              ? t('agentSubtitle')
              : t('customerSubtitle')}
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border border-error-200 bg-error-50/80 px-4 py-3 text-sm text-error-700 backdrop-blur-sm dark:border-error-800/50 dark:bg-error-900/10 dark:text-error-400"
          >
            {error}
          </motion.div>
        )}

        {/* Google sign-up temporarily hidden per product decision — restore
            GoogleOAuthButton + its "or register with email" divider here. */}

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">
            {/* Name row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>
                  {t('firstName')} <span className="text-error-500">*</span>
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
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </span>
                  <Input
                    type="text"
                    placeholder={t('firstNamePlaceholder')}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>
                  {t('lastName')} <span className="text-error-500">*</span>
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
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </span>
                  <Input
                    type="text"
                    placeholder={t('lastNamePlaceholder')}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

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
                  type="email"
                  placeholder={t('emailPlaceholder')}
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
                  {t('emailPrivacyNote')}
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
                  placeholder={t('createPasswordPlaceholder')}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (touched.password)
                      setFieldErrors((prev) => ({
                        ...prev,
                        password: validatePassword(e.target.value, passwordMsgs),
                      }));
                  }}
                  onBlur={() => handleBlur("password")}
                  error={touched.password ? !!fieldErrors.password : false}
                  success={!!touched.password && !!password && !fieldErrors.password}
                  required
                  autoComplete="new-password"
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
                    <EyeIcon className="h-4 w-4" />
                  ) : (
                    <EyeCloseIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              {touched.password && fieldErrors.password ? (
                <p className="mt-1.5 text-xs text-error-500">{fieldErrors.password}</p>
              ) : null}
              {password && <PasswordStrengthBar value={password} />}
            </div>

            {/* T&C */}
            <div className="flex items-start gap-3">
              <Checkbox checked={isChecked} onChange={setIsChecked} />
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('agreePrefix')}{" "}
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {t('termsAndConditions')}
                </span>{" "}
                {t('agreeAnd')}{" "}
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {t('privacyPolicy')}
                </span>
              </p>
            </div>

            {/* Submit */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-teal-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
              >
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
                    {t('creatingAccount')}
                  </span>
                ) : isAgent ? (
                  t('createAgentAccount')
                ) : (
                  t('createAccount')
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Sign in link */}
        <div className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-800">
          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            {t('alreadyHaveAccount')}{" "}
            <Link
              href="/signin"
              className="font-semibold text-brand-teal hover:text-brand-teal-600 transition-colors dark:text-brand-teal-300 dark:hover:text-brand-teal-200"
            >
              {t('signIn')}
            </Link>
          </p>
          {isAgent && (
            <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
              {t('wantFullRegistration')}{" "}
              <Link
                href="/agent-register"
                className="font-medium text-brand-teal hover:text-brand-teal-600 dark:text-brand-teal-300 dark:hover:text-brand-teal-200"
              >
                {t('useExtendedForm')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
