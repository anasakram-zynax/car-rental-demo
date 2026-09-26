'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import './flatpickr-theme.css';
import type { Instance } from 'flatpickr/dist/types/instance';

interface SearchDateInputProps {
  value: string;
  min?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchDateInput({
  value,
  min,
  disabled = false,
  required = false,
  ariaLabel,
  onChange,
  className = '',
}: SearchDateInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tc = useTranslations('Common');
  const instanceRef = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current || !wrapperRef.current) return;

    instanceRef.current = flatpickr(inputRef.current, {
      dateFormat: 'Y-m-d',
      defaultDate: value || undefined,
      minDate: min,
      disableMobile: true,
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
      onChange: (_dates, dateStr) => onChangeRef.current(dateStr),
    });

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.set('minDate', min || null);
  }, [min]);

  useEffect(() => {
    if (!instanceRef.current) return;
    if (value) {
      instanceRef.current.setDate(value, false, 'Y-m-d');
    } else {
      instanceRef.current.clear(false);
    }
  }, [value]);

  useEffect(() => {
    if (!instanceRef.current) return;
    if (disabled) {
      instanceRef.current.close();
    }
  }, [disabled]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className={className}
        placeholder={tc('selectDate')}
        type="text"
        inputMode="none"
      />
    </div>
  );
}
