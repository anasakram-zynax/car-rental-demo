"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PriceRangeSlider } from "@/components/search/PriceRangeSlider";

const ease = [0.16, 1, 0.3, 1] as const;
const FILTER_KEYS = [
  "minPrice",
  "maxPrice",
  "transmission",
  "passengerCapacity",
  "luggageCapacity",
  "category",
] as const;

export interface CarsFilterOptions {
  categories: string[];
  transmissions: string[];
  passengerCapacities: number[];
  luggageCapacities: number[];
  priceMax: number;
  resultCount: number;
  currencySymbol: string;
}

const title = (value: string) =>
  value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

export function CarsResultsControls({
  options,
}: {
  options: CarsFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = FILTER_KEYS.filter((key) => current.has(key)).length;
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(current.toString());
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    next.set("page", "1");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const clear = () => {
    const next = new URLSearchParams(current.toString());
    FILTER_KEYS.forEach((key) => next.delete(key));
    next.set("page", "1");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const panel = (
    <FilterPanel
      current={current}
      activeCount={activeCount}
      options={options}
      update={update}
      clear={clear}
    />
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200/60 bg-white text-sm font-semibold text-charcoal shadow-sm lg:hidden"
      >
        <FilterIcon /> Filters{" "}
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-teal px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
      <div className="hidden lg:block">{panel}</div>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/30 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease }}
              className="h-full w-[min(88vw,340px)] overflow-y-auto bg-zinc-50 p-3"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="mb-3 min-h-11 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-brand-teal"
              >
                Close filters
              </button>
              {panel}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function FilterPanel({
  current,
  activeCount,
  options,
  update,
  clear,
}: {
  current: URLSearchParams;
  activeCount: number;
  options: CarsFilterOptions;
  update: (values: Record<string, string>) => void;
  clear: () => void;
}) {
  return (
    <aside className="w-full">
      <div className="rounded-2xl border border-zinc-200/60 bg-white shadow-[0_4px_24px_rgba(3,61,74,0.06)]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <FilterIcon />
            <h2 className="text-sm font-semibold text-charcoal">Filters</h2>
            {activeCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-xs font-semibold text-brand-teal transition-colors hover:text-[#012830]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="px-3 pb-4 pt-1">
          <FilterGroup
            title="Price"
            icon={<MoneyIcon />}
            defaultOpen
            active={current.has("minPrice") || current.has("maxPrice")}
          >
            <CarsPriceFilter
              key={`${current.get("minPrice")}-${current.get("maxPrice")}-${options.priceMax}`}
              current={current}
              options={options}
              update={update}
            />
          </FilterGroup>
          <FilterGroup
            title="Car type"
            icon={<CarIcon />}
            defaultOpen
            active={current.has("category")}
          >
            <RadioOptions
              name="category"
              selected={current.get("category")}
              options={options.categories.map((value) => ({
                value,
                label: title(value),
              }))}
              onSelect={(value) =>
                update({
                  category: value === current.get("category") ? "" : value,
                })
              }
            />
          </FilterGroup>
          <FilterGroup
            title="Transmission"
            icon={<TransmissionIcon />}
            active={current.has("transmission")}
          >
            <RadioOptions
              name="transmission"
              selected={current.get("transmission")}
              options={options.transmissions.map((value) => ({
                value,
                label: title(value),
              }))}
              onSelect={(value) =>
                update({
                  transmission:
                    value === current.get("transmission") ? "" : value,
                })
              }
            />
          </FilterGroup>
          <FilterGroup
            title="Passengers"
            icon={<PeopleIcon />}
            active={current.has("passengerCapacity")}
          >
            <RadioOptions
              name="passengers"
              selected={current.get("passengerCapacity")}
              options={options.passengerCapacities.map((value) => ({
                value: String(value),
                label: `${value}+ passengers`,
              }))}
              onSelect={(value) =>
                update({
                  passengerCapacity:
                    value === current.get("passengerCapacity") ? "" : value,
                })
              }
            />
          </FilterGroup>
          <FilterGroup
            title="Luggage"
            icon={<LuggageIcon />}
            active={current.has("luggageCapacity")}
          >
            <RadioOptions
              name="luggage"
              selected={current.get("luggageCapacity")}
              options={options.luggageCapacities.map((value) => ({
                value: String(value),
                label: `${value}+ bags`,
              }))}
              onSelect={(value) =>
                update({
                  luggageCapacity:
                    value === current.get("luggageCapacity") ? "" : value,
                })
              }
            />
          </FilterGroup>
        </div>
      </div>
    </aside>
  );
}

function CarsPriceFilter({
  current,
  options,
  update,
}: {
  current: URLSearchParams;
  options: CarsFilterOptions;
  update: (values: Record<string, string>) => void;
}) {
  const max = Math.max(1, options.priceMax);
  const urlValue = useMemo<[number, number]>(
    () => [
      Math.max(0, Number(current.get("minPrice")) || 0),
      Math.min(max, Number(current.get("maxPrice")) || max),
    ],
    [current, max],
  );
  const [value, setValue] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const change = (range: [number, number]) => {
    setValue(range);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        update({
          minPrice: range[0] === 0 ? "" : String(range[0]),
          maxPrice: range[1] === max ? "" : String(range[1]),
        }),
      220,
    );
  };
  const quarter = Math.max(1, Math.round(max / 4));
  const symbol = options.currencySymbol;
  return (
    <PriceRangeSlider
      min={0}
      max={max}
      value={value}
      onChange={change}
      resultCount={options.resultCount}
      currencySymbol={symbol}
      presets={[
        { label: `${symbol}0–${symbol}${quarter}`, min: 0, max: quarter },
        {
          label: `${symbol}${quarter}–${symbol}${quarter * 2}`,
          min: quarter,
          max: Math.min(max, quarter * 2),
        },
        {
          label: `${symbol}${quarter * 2}–${symbol}${quarter * 3}`,
          min: Math.min(max - 1, quarter * 2),
          max: Math.min(max, quarter * 3),
        },
        {
          label: `${symbol}${quarter * 3}+`,
          min: Math.min(max - 1, quarter * 3),
          max,
        },
      ]}
    />
  );
}

function FilterGroup({
  title,
  icon,
  active,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  active: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || active);
  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-brand-teal/60">{icon}</span>
          <span className="text-[13px] font-semibold text-charcoal">
            {title}
          </span>
          {active && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
          )}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
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
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="pb-3 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RadioOptions({
  name,
  selected,
  options,
  onSelect,
}: {
  name: string;
  selected: string | null;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((option) => {
        const checked = selected === option.value;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150 ${checked ? "bg-brand-teal/5 font-medium text-brand-teal" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}
          >
            <span
              className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${checked ? "border-brand-teal" : "border-zinc-200 bg-white"}`}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                readOnly
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(option.value);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {checked && (
                <span className="h-2 w-2 rounded-full bg-brand-teal" />
              )}
            </span>
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

const icon = (path: string) => (
  <svg
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);
function FilterIcon() {
  return icon(
    "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75",
  );
}
function MoneyIcon() {
  return icon(
    "M12 6v12m-3-2.8.9.7c1.2.9 3.1.9 4.2 0 1.2-.9 1.2-2.3 0-3.2C13.5 12.2 12.8 12 12 12s-1.5-.2-2-.7c-1.1-.9-1.1-2.3 0-3.2 1.1-.9 2.9-.9 4 0",
  );
}
function CarIcon() {
  return icon(
    "M3 13.5l1.5-5.25A2.25 2.25 0 016.66 6.6h10.68a2.25 2.25 0 012.16 1.65L21 13.5M5.25 18.75h13.5M6 15.75h.008v.008H6v-.008zm12 0h.008v.008H18v-.008z",
  );
}
function TransmissionIcon() {
  return icon("M8 4v16m8-16v16M8 8h8M8 16h8");
}
function PeopleIcon() {
  return icon(
    "M15 19.1a9.4 9.4 0 002.6.4 9.3 9.3 0 004.1-1 4.1 4.1 0 00-7.5-2.4M12 6.4a3.4 3.4 0 11-6.8 0 3.4 3.4 0 016.8 0z",
  );
}
function LuggageIcon() {
  return icon(
    "M6.75 7.5h10.5a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V9.75A2.25 2.25 0 016.75 7.5zm2.25 0V5.25A2.25 2.25 0 0111.25 3h1.5A2.25 2.25 0 0115 5.25V7.5",
  );
}
