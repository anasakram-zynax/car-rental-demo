"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CarsSelectOption {
  value: string;
  label: string;
}

export function CarsSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
}: {
  value: string;
  options: CarsSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-brand-teal/40 focus-visible:ring-2 focus-visible:ring-brand-teal/20 disabled:cursor-not-allowed disabled:text-slate-400 ${className}`}
        >
          <span className="truncate">{selected?.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-slate-200 bg-white p-1.5 shadow-xl"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="min-h-10 cursor-pointer rounded-lg px-3 text-sm font-medium text-slate-700 focus:bg-brand-teal/5 focus:text-brand-teal"
          >
            <span className="flex-1">{option.label}</span>
            {option.value === value && (
              <Check className="h-4 w-4 text-brand-teal" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
