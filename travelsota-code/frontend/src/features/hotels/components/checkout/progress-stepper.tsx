"use client";
import { useTranslations } from 'next-intl';


import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

const STEPS = [
  { key: "details", label: "Details", desc: "Guest & rooms" },
  { key: "payment", label: "Payment", desc: "Method & review" },
  { key: "confirm", label: "Confirm", desc: "Complete booking" },
] as const;

interface ProgressStepperProps {
  current: "details" | "payment" | "confirm";
}

export function ProgressStepper({ current }: ProgressStepperProps) {
  const t = useTranslations('Checkout');
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-0" role="progressbar" aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={3}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isUpcoming = i > currentIdx;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <motion.div
              initial={false}
              animate={{
                scale: isCurrent ? 1 : 1,
              }}
              className="flex items-center gap-3 shrink-0"
            >
              <motion.span
                initial={false}
                animate={{
                  backgroundColor: isCompleted ? "var(--color-brand-teal)" : isCurrent ? "var(--color-brand-teal)" : "transparent",
                  borderColor: isCompleted ? "var(--color-brand-teal)" : isCurrent ? "var(--color-brand-teal)" : "var(--color-zinc-300)",
                }}
                transition={{ duration: 0.3, ease }}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isCompleted || isCurrent ? "text-white" : "text-zinc-400"
                }`}
              >
                {isCompleted ? (
                  <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, ease }}
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={3}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </motion.svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </motion.span>
              <div className="hidden sm:block">
                <p className={`text-sm font-semibold ${isUpcoming ? "text-zinc-400" : "text-charcoal"}`}>
                  {step.label}
                </p>
                <p className="text-[11px] text-zinc-400">{step.desc}</p>
              </div>
            </motion.div>

            {i < STEPS.length - 1 && (
              <div className="mx-3 flex-1 h-px relative">
                <div className="absolute inset-0 bg-zinc-200 rounded-full" />
                <motion.div
                  initial={false}
                  animate={{
                    scaleX: isCompleted ? 1 : 0,
                  }}
                  transition={{ duration: 0.5, ease }}
                  className="absolute inset-0 bg-brand-teal rounded-full origin-left"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
