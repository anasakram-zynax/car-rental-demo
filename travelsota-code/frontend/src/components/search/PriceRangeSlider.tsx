'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
  currency?: string;
  currencySymbol?: string;
  presets?: Array<{ label: string; min: number; max: number }>;
  step?: number;
  resultCount?: number;
  label?: string;
}

function formatPrice(value: number, symbol: string): string {
  if (symbol === '$') {
    return value >= 1000 ? `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `$${value}`;
  }
  return `${symbol}${value}`;
}

export function PriceRangeSlider({
  min,
  max,
  value,
  onChange,
  currencySymbol = '$',
  presets = [],
  step: customStep,
  resultCount,
  label = 'Price',
}: PriceRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  
  // Use refs for values to avoid stale closures during drag
  const valueRef = useRef(value);
  valueRef.current = value;

  const range = max - min || 1;
  const effectiveStep = customStep ?? Math.max(1, Math.floor(range / 100));

  const toPercent = (v: number) => ((v - min) / range) * 100;
  const fromPercent = (pct: number) => {
    const raw = min + (pct / 100) * range;
    return Math.round(raw / effectiveStep) * effectiveStep;
  };

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  // getValueFromPosition uses refs to avoid stale closure
  const getValueFromPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return valueRef.current[0];
      const rect = trackRef.current.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      return clamp(fromPercent(pct));
    },
    [min, max, range, effectiveStep],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const v = getValueFromPosition(clientX);
      const currentValue = valueRef.current;
      if (dragging === 'min') {
        onChange([Math.min(v, currentValue[1] - effectiveStep), currentValue[1]]);
      } else {
        onChange([currentValue[0], Math.max(v, currentValue[0] + effectiveStep)]);
      }
    };

    const handleUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging, getValueFromPosition, onChange, effectiveStep]);

  const leftPct = toPercent(value[0]);
  const rightPct = toPercent(value[1]);
  const isFullRange = value[0] === min && value[1] === max;

  return (
    <div className="space-y-3 px-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-sm font-bold text-charcoal tabular-nums">
          {formatPrice(value[0], currencySymbol)} — {formatPrice(value[1], currencySymbol)}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer rounded-full bg-zinc-100 mx-3"
        onMouseDown={(e) => {
          const v = getValueFromPosition(e.clientX);
          const distToMin = Math.abs(v - value[0]);
          const distToMax = Math.abs(v - value[1]);
          if (distToMin < distToMax) {
            onChange([Math.min(v, value[1] - effectiveStep), value[1]]);
            setDragging('min');
          } else {
            onChange([value[0], Math.max(v, value[0] + effectiveStep)]);
            setDragging('max');
          }
        }}
      >
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-brand-teal to-[#0a5a6b]"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />

        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-[3px] border-white bg-brand-teal shadow-[0_2px_8px_rgba(3,61,74,0.25)] will-change-transform ${
            dragging === 'min' ? 'scale-125' : 'hover:scale-110'
          }`}
          style={{ left: `${leftPct}%`, transition: dragging === 'min' ? 'none' : 'transform 100ms' }}
          onMouseDown={(e) => { e.stopPropagation(); setDragging('min'); }}
          onTouchStart={(e) => { e.stopPropagation(); setDragging('min'); }}
        />

        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-[3px] border-white bg-brand-teal shadow-[0_2px_8px_rgba(3,61,74,0.25)] will-change-transform ${
            dragging === 'max' ? 'scale-125' : 'hover:scale-110'
          }`}
          style={{ left: `${rightPct}%`, transition: dragging === 'max' ? 'none' : 'transform 100ms' }}
          onMouseDown={(e) => { e.stopPropagation(); setDragging('max'); }}
          onTouchStart={(e) => { e.stopPropagation(); setDragging('max'); }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
        <span>{formatPrice(min, currencySymbol)}</span>
        <span>{formatPrice(max, currencySymbol)}</span>
      </div>

      {resultCount != null && (
        <p className="text-xs text-zinc-500 tabular-nums">
          {resultCount} {resultCount === 1 ? 'result' : 'results'} {isFullRange ? '' : 'in range'}
        </p>
      )}

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const active = value[0] === preset.min && value[1] === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  if (active) {
                    onChange([min, max]);
                  } else {
                    onChange([preset.min, preset.max]);
                  }
                }}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-brand-teal text-white shadow-sm'
                    : 'bg-zinc-50 text-zinc-600 hover:bg-brand-teal/5 hover:text-brand-teal'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          {!isFullRange && (
            <button
              type="button"
              onClick={() => onChange([min, max])}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-brand-teal"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
