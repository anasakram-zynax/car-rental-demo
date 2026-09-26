'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import './flatpickr-theme.css';
import type { Instance } from 'flatpickr/dist/types/instance';

interface SearchDateRangeInputProps {
  departureDate: string;
  returnDate: string;
  min?: string;
  disabled?: boolean;
  onChange: (dates: { departureDate: string; returnDate: string }) => void;
  className?: string;
}

export function SearchDateRangeInput({
  departureDate,
  returnDate,
  min,
  disabled = false,
  onChange,
  className = '',
}: SearchDateRangeInputProps) {
  const t = useTranslations('Flights');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceRef = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current || !wrapperRef.current) return;

    instanceRef.current = flatpickr(inputRef.current, {
      mode: 'range',
      dateFormat: 'Y-m-d',
      defaultDate: [departureDate, returnDate].filter(Boolean),
      minDate: min || new Date(),
      disableMobile: true,
      showMonths: typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 2,
      monthSelectorType: 'static',
      appendTo: document.body,
      position: 'auto',
      onOpen: (_dates, _str, instance) => {
        const cal = instance.calendarContainer;
        const input = instance.input;
        if (!cal || !input) return;
        const r = input.getBoundingClientRect();
        const calHeight = cal.offsetHeight || 330;
        const calWidth = cal.offsetWidth || 300;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const spaceBelow = vh - r.bottom;
        const spaceAbove = r.top;

        if (spaceBelow < calHeight + 10 && spaceAbove > spaceBelow) {
          cal.classList.remove('arrowTop');
          cal.classList.add('arrowBottom');
          const top = Math.max(8, window.scrollY + r.top - calHeight - 6);
          cal.style.top = `${top}px`;
        } else {
          const maxTop = window.scrollY + vh - calHeight - 8;
          const desiredTop = window.scrollY + r.bottom + 6;
          cal.style.top = `${Math.min(desiredTop, maxTop)}px`;
        }

        const left = parseFloat(cal.style.left) || r.left;
        if (left + calWidth > vw - 8) {
          cal.style.left = `${Math.max(8, vw - calWidth - 8)}px`;
        }
      },
      onChange: (dates) => {
        if (dates.length === 2) {
          const format = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };
          onChangeRef.current({ departureDate: format(dates[0]), returnDate: format(dates[1]) });
        }
      },
    });

    const handleResize = () => {
      if (!instanceRef.current) return;
      const isMobile = window.innerWidth < 768;
      instanceRef.current.set('showMonths', isMobile ? 1 : 2);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.set('minDate', min || null);
  }, [min]);

  useEffect(() => {
    if (!instanceRef.current) return;
    const dates = [departureDate, returnDate].filter(Boolean);
    if (dates.length) {
      instanceRef.current.setDate(dates as string[], false, 'Y-m-d');
    } else {
      instanceRef.current.clear(false);
    }
  }, [departureDate, returnDate]);

  useEffect(() => {
    if (!instanceRef.current) return;
    if (disabled) instanceRef.current.close();
  }, [disabled]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        disabled={disabled}
        aria-label={t('selectTravelDates')}
        onChange={() => {}}
        className={className}
        placeholder={t('selectDatesPlaceholder')}
        type="text"
        inputMode="none"
      />
    </div>
  );
}
