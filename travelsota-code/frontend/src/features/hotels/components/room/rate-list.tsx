"use client";
import { useTranslations } from 'next-intl';


import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RateCard } from "./rate-card";
import type { EnrichedRate } from "../../api/get-hotel-details";

interface RateListProps {
  rates: EnrichedRate[];
  selectedRateKey: string | null;
  nights: number;
  onSelect: (rateId: string) => void;
  maxVisible?: number;
}

export function RateList({
  rates,
  selectedRateKey,
  nights,
  onSelect,
  maxVisible = 3,
}: RateListProps) {
  const t = useTranslations('Checkout');
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rates : rates.slice(0, maxVisible);
  const hasMore = rates.length > maxVisible;

  if (rates.length === 0) return null;

  return (
    <div>
      <AnimatePresence mode="popLayout">
        {visible.map((rate) => (
          <RateCard
            key={rate.rateId}
            rate={rate}
            isSelected={selectedRateKey === rate.rateId}
            nights={nights}
            onSelect={onSelect}
          />
        ))}
      </AnimatePresence>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-brand-teal/5 px-5 py-3 text-xs font-semibold text-brand-teal transition hover:bg-brand-teal/5 active:scale-[0.99] dark:border-white/5"
        >
          <motion.svg
            animate={{ rotate: showAll ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </motion.svg>
          {showAll
            ? "Show fewer rates"
            : `Show all ${rates.length} rates`}
        </button>
      )}
    </div>
  );
}
