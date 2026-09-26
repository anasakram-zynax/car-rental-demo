"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

type SortKey = "price_asc" | "price_desc" | "rating" | "name";

interface SortBarProps {
  total: number;
  destination: string;
  currentSort: SortKey;
  onSortChange: (sort: SortKey) => void;
  searchKey?: string;
}

export function SortBar({ total, destination, currentSort, onSortChange }: SortBarProps) {
  const t = useTranslations('Hotels');
  const tc = useTranslations('Common');
  const sortOptions = [
    { key: "price_asc" as SortKey, label: t('sortPriceAsc') },
    { key: "price_desc" as SortKey, label: t('sortPriceDesc') },
    { key: "rating" as SortKey, label: t('sortRating') },
    { key: "name" as SortKey, label: t('sortName') },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-bold text-charcoal">
          {t('resultsFound', { count: total })}
        </p>
        <p className="text-[13px] text-[#7d7d7d] mt-0.5">{destination}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 hidden sm:inline">{tc('sortBy')}:</span>
        <select
          value={currentSort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="h-9 cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:border-zinc-300 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/20"
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>
    </motion.div>
  );
}
