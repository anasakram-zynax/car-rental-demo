'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_KEYS = ['monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun', 'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec'] as const;

export interface BookingDateParts {
  day: string;
  month: string;
  year: string;
}

interface BookingDateSelectProps {
  day: string;
  month: string;
  year: string;
  onChange: (parts: BookingDateParts) => void;
  /** Bounds as ISO "YYYY-MM-DD". Used to derive the selectable year range. */
  min?: string;
  max?: string;
  error?: string;
  valid?: boolean;
  ariaLabel: string;
  yearOrder?: 'asc' | 'desc';
}

const selectBase =
  'h-11 w-full appearance-none rounded-lg border bg-white px-3 text-sm text-zinc-900 outline-none transition-all duration-150';

function selectClass(error?: string, valid?: boolean, empty?: boolean): string {
  const base = `${selectBase} ${empty ? 'text-zinc-400' : ''}`;
  if (error) return `${base} border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500/20`;
  if (valid) return `${base} border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20`;
  return `${base} border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/10`;
}

function daysInMonth(month: string, year: string): number {
  const monthIndex = MONTHS.indexOf(month as (typeof MONTHS)[number]);
  const yearNumber = Number(year);
  if (monthIndex < 0 || !Number.isInteger(yearNumber) || yearNumber <= 0) return 31;
  return new Date(yearNumber, monthIndex + 1, 0).getDate();
}

export function BookingDateSelect({
  day,
  month,
  year,
  onChange,
  min,
  max,
  error,
  valid,
  ariaLabel,
  yearOrder = 'desc',
}: BookingDateSelectProps) {
  const tBooking = useTranslations('Booking');
  const now = new Date();
  const minYear = (min ? new Date(min) : new Date(now.getFullYear() - 120, 0, 1)).getFullYear();
  const maxYear = (max ? new Date(max) : new Date(now.getFullYear() + 15, 11, 31)).getFullYear();

  const years = useMemo(() => {
    const list: string[] = [];
    for (let y = minYear; y <= maxYear; y++) list.push(String(y));
    if (yearOrder === 'desc') list.reverse();
    return list;
  }, [minYear, maxYear, yearOrder]);

  const dayCount = daysInMonth(month, year);
  const days = useMemo(() => {
    const list: string[] = [];
    for (let d = 1; d <= dayCount; d++) list.push(String(d).padStart(2, '0'));
    return list;
  }, [dayCount]);

  const handleMonth = (nextMonth: string) => {
    const nextDayCount = daysInMonth(nextMonth, year);
    onChange({ day: day && Number(day) > nextDayCount ? '' : day, month: nextMonth, year });
  };
  const handleYear = (nextYear: string) => {
    const nextDayCount = daysInMonth(month, nextYear);
    onChange({ day: day && Number(day) > nextDayCount ? '' : day, month, year: nextYear });
  };

  return (
    <div className="grid grid-cols-[1fr_1.15fr_1.35fr] gap-2" role="group" aria-label={ariaLabel}>
      <select
        value={day}
        onChange={(event) => onChange({ day: event.target.value, month, year })}
        className={selectClass(error, valid, !day)}
        aria-label={`${ariaLabel} day`}
        aria-invalid={!!error}
      >
        <option value="" disabled>
          {tBooking('dateDay')}
        </option>
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(event) => handleMonth(event.target.value)}
        className={selectClass(error, valid, !month)}
        aria-label={`${ariaLabel} month`}
        aria-invalid={!!error}
      >
        <option value="" disabled>
          {tBooking('dateMonth')}
        </option>
        {MONTHS.map((m, i) => (
          <option key={m} value={m}>
            {tBooking(MONTH_KEYS[i])}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(event) => handleYear(event.target.value)}
        className={selectClass(error, valid, !year)}
        aria-label={`${ariaLabel} year`}
        aria-invalid={!!error}
      >
        <option value="" disabled>
          {tBooking('dateYear')}
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
