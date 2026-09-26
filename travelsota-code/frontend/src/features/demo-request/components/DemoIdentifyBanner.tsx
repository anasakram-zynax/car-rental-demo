"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { identifyDemoVisitor } from "../api/demo-sessions";

const DISMISS_KEY = "demo_identify_dismissed";
const DONE_KEY = "demo_identify_done";

/**
 * Optional, low-friction lead capture: "leave your email" floating card.
 * Shows once per visitor until dismissed or submitted (localStorage flags).
 * Delayed 4s so it never competes with the dashboard's first paint.
 */
export default function DemoIdentifyBanner() {
  const tCommon = useTranslations("Common");
  const tCheckout = useTranslations("Checkout");
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) || window.localStorage.getItem(DONE_KEY)) {
        return;
      }
    } catch {
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      await identifyDemoVisitor({ email, name: name || undefined });
      try {
        window.localStorage.setItem(DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      setState("done");
      window.setTimeout(() => setVisible(false), 2500);
    } catch {
      setState("error");
    }
  };

  if (!visible) return null;

  return (
    <div
      role="complementary"
      aria-label={tCommon('demoContactRequest')}
      className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_12px_40px_rgba(0,40,100,0.18)] dark:border-gray-700 dark:bg-gray-900"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={tCheckout('dismiss')}
        className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {state === "done" ? (
        <p className="pr-6 text-sm font-medium text-gray-900 dark:text-white">
          {tCommon('demoThankYou')}
        </p>
      ) : (
        <>
          <h2 className="pr-6 text-sm font-bold text-gray-900 dark:text-white">
            {tCommon('demoLikeTitle')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {tCommon('demoLikeDesc')}
          </p>
          <form onSubmit={submit} className="mt-3 space-y-2">
            <label htmlFor="demo-identify-email" className="sr-only">
              {tCommon('demoEmailSr')}
            </label>
            <input
              id="demo-identify-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tCommon('demoEmailPlaceholder')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-2 focus:outline-offset-1 focus:outline-brand-teal dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <label htmlFor="demo-identify-name" className="sr-only">
              {tCommon('demoNameSr')}
            </label>
            <input
              id="demo-identify-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tCommon('demoNamePlaceholder')}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-2 focus:outline-offset-1 focus:outline-brand-teal dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            {state === "error" && (
              <p className="text-xs text-error-500" role="alert">
                {tCommon('demoGenericError')}
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending"}
              className="min-h-[44px] w-full cursor-pointer rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "sending" ? tCommon('demoSending') : tCommon('demoRequestFollowUp')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
