"use client";

// Controlled range switcher shared by the dashboard charts (Sales Trend +
// Bookings Trend). "Monthly / Quarterly / Annually" are real, backend-backed
// periods — both charts re-query on change (no disabled decoration).
//
// Responsive: the switcher sits in card headers, so on ≤380px screens the
// padding tightens instead of wrapping the header onto two rows.

import React, { useState } from "react";

export type TrendPeriod = "monthly" | "quarterly" | "annually";

interface ChartTabProps {
  /** Controlled value (preferred — the page owns the query params). */
  value?: TrendPeriod;
  /** Uncontrolled initial value. */
  defaultValue?: TrendPeriod;
  onChange?: (value: TrendPeriod) => void;
  className?: string;
}

const OPTIONS: { value: TrendPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const ChartTab: React.FC<ChartTabProps> = ({ value, defaultValue = "monthly", onChange, className }) => {
  const [internal, setInternal] = useState<TrendPeriod>(defaultValue);
  const selected = value ?? internal;

  const handleClick = (option: TrendPeriod) => {
    setInternal(option);
    onChange?.(option);
  };

  const getButtonClass = (option: TrendPeriod) =>
    selected === option
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground";

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1 ${className ?? ""}`}
      role="group"
      aria-label="Chart period"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => handleClick(option.value)}
          aria-pressed={selected === option.value}
          className={`cursor-pointer select-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform,box-shadow] duration-150 ease-out min-[400px]:px-3 sm:text-sm active:scale-[0.97] ${getButtonClass(option.value)}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default ChartTab;
