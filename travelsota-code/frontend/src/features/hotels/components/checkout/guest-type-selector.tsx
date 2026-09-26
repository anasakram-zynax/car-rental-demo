"use client";
import { useTranslations } from 'next-intl';


import { motion, AnimatePresence } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

interface GuestTypeSelectorProps {
  isGuest: boolean;
  onChange: (isGuest: boolean) => void;
}

export function GuestTypeSelector({ isGuest, onChange }: GuestTypeSelectorProps) {
  const t = useTranslations('Checkout');
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease, delay: 0.05 }}
      className="space-y-3"
    >
      <h2 className="text-sm font-semibold text-charcoal">Booking as</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => onChange(true)}
          className={`relative cursor-pointer rounded-xl border p-4 text-left transition-colors duration-200 ${
            isGuest
              ? "border-brand-teal bg-brand-teal/5 shadow-[0_2px_12px_rgba(3,61,74,0.10)]"
              : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
          }`}
        >
          <AnimatePresence>
            {isGuest && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.2, ease }}
                className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal"
              >
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal/10">
            <svg className="h-5 w-5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-charcoal">Guest Booking</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            You are booking as a guest. You can create an account after completing your booking.
          </p>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => onChange(false)}
          className={`relative cursor-pointer rounded-xl border p-4 text-left transition-colors duration-200 ${
            !isGuest
              ? "border-brand-teal bg-brand-teal/5 shadow-[0_2px_12px_rgba(3,61,74,0.10)]"
              : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
          }`}
        >
          <AnimatePresence>
            {!isGuest && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.2, ease }}
                className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal"
              >
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal/10">
            <svg className="h-5 w-5 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-charcoal">Login your Account</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            If you have an account, please log in to access your saved details and manage your bookings easily.
          </p>
        </motion.button>
      </div>
    </motion.div>
  );
}
