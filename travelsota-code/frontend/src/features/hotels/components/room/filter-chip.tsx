"use client";
import { useTranslations } from 'next-intl';


interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FilterChip({
  label,
  active = false,
  onClick,
  className = "",
}: FilterChipProps) {
  const t = useTranslations('Checkout');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.96] ${
        active
          ? "border-brand-teal bg-brand-teal text-white shadow-sm"
          : "border-brand-teal/15 bg-white text-brand-teal hover:border-brand-teal/30 hover:bg-brand-teal/5"
      } ${className}`}
    >
      {label}
    </button>
  );
}
