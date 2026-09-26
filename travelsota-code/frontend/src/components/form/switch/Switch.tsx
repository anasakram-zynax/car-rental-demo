"use client";
import React, { useState } from "react";

interface SwitchProps {
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /**
   * Mutation in flight. Unlike `disabled` (a steady, unavailable state),
   * `busy` keeps the switch's CURRENT color and slides a small spinner into
   * the thumb — the control never flashes white/gray while saving.
   */
  busy?: boolean;
  onChange?: (checked: boolean) => void;
  color?: "blue" | "gray";
  ariaLabel?: string;
}

const Switch: React.FC<SwitchProps> = ({
  label,
  defaultChecked = false,
  checked,
  disabled = false,
  busy = false,
  onChange,
  color = "blue",
  ariaLabel,
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked ?? internalChecked;

  const handleToggle = () => {
    if (disabled || busy) return;
    const next = !isChecked;
    if (checked === undefined) setInternalChecked(next);
    onChange?.(next);
  };

  const trackBg =
    color === "blue"
      ? isChecked
        ? "bg-emerald-500 dark:bg-emerald-400"
        : "bg-gray-300 dark:bg-gray-600"
      : isChecked
        ? "bg-gray-800 dark:bg-white/20"
        : "bg-gray-300 dark:bg-gray-600";

  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-label={ariaLabel || label || "Toggle setting"}
        aria-busy={busy || undefined}
        aria-disabled={disabled || busy || undefined}
        disabled={disabled}
        data-admin-switch={color === "blue" ? "true" : undefined}
        data-state={isChecked ? "checked" : "unchecked"}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          disabled ? "cursor-not-allowed opacity-60" : busy ? "cursor-progress" : "cursor-pointer"
        }`}
        onClick={handleToggle}
      >
        {/* Track: steady color while busy — the previous `disabled` styling
            turned the track near-white mid-save, which read as a white flash. */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full transition-colors duration-200 ease-in-out ${
            disabled ? "bg-gray-100 dark:bg-gray-800" : trackBg
          }`}
        />
        <span
          aria-hidden
          className={`absolute top-1/2 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ease-in-out ${
            isChecked ? "left-[calc(100%-1.375rem)]" : "left-0.5"
          } -translate-y-1/2`}
        >
          {busy ? (
            <span className="absolute inset-0 m-auto size-2.5 animate-spin rounded-full border-[1.5px] border-gray-500 border-t-transparent" />
          ) : null}
        </span>
      </button>
      {label ? (
        <span className={disabled ? "text-gray-400" : "text-gray-700 dark:text-gray-400"}>
          {label}
        </span>
      ) : null}
    </div>
  );
};

export default Switch;
