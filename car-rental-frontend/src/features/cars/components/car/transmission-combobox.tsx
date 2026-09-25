"use client";

import { Check, Cog } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

interface TransmissionComboboxProps {
  disabled?: boolean;
  error?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function TransmissionCombobox({
  disabled = false,
  error,
  onChange,
  options,
  value,
}: TransmissionComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(() => {
    const search = value.trim().toLocaleLowerCase();
    if (!search) return options;
    return options.filter((option) =>
      option.toLocaleLowerCase().includes(search),
    );
  }, [options, value]);
  const highlightedIndex = filteredOptions.length
    ? Math.min(activeIndex, filteredOptions.length - 1)
    : 0;

  function select(option: string) {
    onChange(option);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        filteredOptions.length
          ? Math.min(current + 1, filteredOptions.length - 1)
          : 0,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      select(filteredOptions[highlightedIndex]);
    }
  }

  return (
    <div className="relative">
      <Input
        id="car-transmission"
        name="admin-car-transmission"
        required
        value={value}
        error={error}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
      />
      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-56 overflow-y-auto rounded-control border border-border bg-white p-1.5 shadow-elevated"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[calc(var(--radius-control)-0.2rem)] px-3 py-2.5 text-left text-sm outline-none transition-colors",
                  index === highlightedIndex
                    ? "bg-[#edf4fd] text-primary"
                    : "text-muted hover:bg-[#f4f7fb] hover:text-foreground",
                )}
              >
                <Cog aria-hidden="true" size={15} className="shrink-0" />
                <span className="flex-1">{option}</span>
                {option === value ? (
                  <Check aria-hidden="true" size={15} />
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm text-muted">
              No matching saved transmissions. You can keep this custom value.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
