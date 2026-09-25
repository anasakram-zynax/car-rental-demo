"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import {
  useTransferDropoffLocations,
  useTransferPickupLocations,
} from "@/features/cars/hooks/use-transfer-locations";

interface TransferLocationComboboxProps {
  kind: "pickup" | "dropoff";
  value: string;
  pickupLocation?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  onInputValueChange?: (value: string) => void;
  onDropdownLayout?: (bottom: number | null) => void;
}

export function TransferLocationCombobox({
  disabled = false,
  kind,
  onDropdownLayout,
  onInputValueChange,
  onSelect,
  pickupLocation = "",
  value,
}: TransferLocationComboboxProps) {
  const listId = useId();
  const [inputValue, setInputValue] = useState(value);
  const [debouncedSearch, setDebouncedSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(inputValue.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [inputValue]);

  const pickups = useTransferPickupLocations(
    debouncedSearch,
    kind === "pickup" && open && !disabled,
  );
  const dropoffs = useTransferDropoffLocations(
    pickupLocation,
    debouncedSearch,
    kind === "dropoff" && open && !disabled,
  );
  const query = kind === "pickup" ? pickups : dropoffs;
  const options = query.data ?? [];
  const highlightedIndex = Math.min(
    activeIndex,
    Math.max(options.length - 1, 0),
  );

  useLayoutEffect(() => {
    if (!open || disabled || !dropdownRef.current) {
      onDropdownLayout?.(null);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      onDropdownLayout?.(
        dropdownRef.current?.getBoundingClientRect().bottom ?? null,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [disabled, onDropdownLayout, open, options.length, query.isFetching]);

  function select(option: string) {
    setInputValue(option);
    setDebouncedSearch(option);
    setOpen(false);
    onInputValueChange?.(option);
    onSelect(option);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && options[highlightedIndex]) {
      event.preventDefault();
      select(options[highlightedIndex]);
    }
  }

  return (
    <div className="relative">
      <Input
        label={kind === "pickup" ? "Pickup location" : "Drop-off location"}
        value={inputValue}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setInputValue(event.target.value);
          onInputValueChange?.(event.target.value);
          setActiveIndex(0);
          setOpen(true);
          if (event.target.value !== value) onSelect("");
        }}
        placeholder={
          kind === "pickup"
            ? "Search transfer origins"
            : "Search valid destinations"
        }
        autoComplete="off"
        className="h-11 shadow-none focus:border-primary"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
      />

      {open && !disabled ? (
        <div
          ref={dropdownRef}
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-56 overflow-y-auto rounded-control border border-border bg-white p-1.5 shadow-elevated"
        >
          {query.isFetching ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted">
              <LoaderCircle
                className="animate-spin"
                aria-hidden="true"
                size={16}
              />
              Loading locations…
            </p>
          ) : options.length > 0 ? (
            options.map((option, index) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
                className={`flex w-full items-center gap-2 rounded-[calc(var(--radius-control)-0.2rem)] px-3 py-2.5 text-left text-sm outline-none transition-colors ${
                  index === highlightedIndex
                    ? "bg-[#edf4fd] text-primary"
                    : "text-muted hover:bg-[#f4f7fb] hover:text-foreground"
                }`}
              >
                <MapPin aria-hidden="true" size={15} className="shrink-0" />
                {option}
              </button>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm text-muted">
              No matching locations.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
