"use client";

import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

interface PaymentMethodCardProps {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}

export function PaymentMethodCard({ label, subtitle, icon, selected, onClick }: PaymentMethodCardProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-left transition-colors duration-200 ${
        selected
          ? "border-brand-teal bg-brand-teal/5 shadow-[0_2px_12px_rgba(3,61,74,0.10)]"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      <motion.div
        initial={false}
        animate={{
          backgroundColor: selected ? "var(--color-brand-teal)" : "rgb(244, 244, 245)",
          color: selected ? "#ffffff" : "rgb(82, 82, 91)",
        }}
        transition={{ duration: 0.2, ease }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      >
        {icon}
      </motion.div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-charcoal">{label}</p>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <motion.span
        initial={false}
        animate={{ scale: selected ? 1 : 0, opacity: selected ? 1 : 0 }}
        transition={{ duration: 0.2, ease }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-teal"
      >
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.span>
    </motion.button>
  );
}
