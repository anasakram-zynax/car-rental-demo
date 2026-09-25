"use client";

import { MapPin, RotateCcw, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import type { ServiceType } from "@/features/cars/types/car.types";
import { cn } from "@/lib/cn";
import { TransferLocationCombobox } from "./transfer-location-combobox";

export interface CatalogSearchValues {
  serviceType: ServiceType;
  pickupLocation: string;
  dropoffLocation?: string;
}

interface CarCatalogSearchProps extends CatalogSearchValues {
  onSearch: (values: CatalogSearchValues) => void;
  onClearSearch: () => void;
  canClearSearch: boolean;
}

export function CarCatalogSearch({
  canClearSearch,
  dropoffLocation: initialDropoffLocation,
  onSearch,
  onClearSearch,
  pickupLocation: initialPickupLocation,
  serviceType: initialServiceType,
}: CarCatalogSearchProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [serviceType, setServiceType] = useState(initialServiceType);
  const [pickupLocation, setPickupLocation] = useState(initialPickupLocation);
  const [dropoffLocation, setDropoffLocation] = useState(
    initialDropoffLocation ?? "",
  );
  const [differentDropoff, setDifferentDropoff] = useState(
    initialServiceType === "transfer" && Boolean(initialDropoffLocation),
  );
  const [locationError, setLocationError] = useState<string>();
  const [dropdownClearance, setDropdownClearance] = useState(0);
  const [inputResetVersion, setInputResetVersion] = useState(0);
  const [hasPickupInput, setHasPickupInput] = useState(
    Boolean(initialPickupLocation),
  );
  const [hasDropoffInput, setHasDropoffInput] = useState(
    Boolean(initialDropoffLocation),
  );

  function updateDropdownClearance(bottom: number | null) {
    const formBottom = formRef.current?.getBoundingClientRect().bottom;
    setDropdownClearance(
      bottom && formBottom ? Math.max(0, bottom - formBottom + 16) : 0,
    );
  }

  function handleClearSearch() {
    setPickupLocation("");
    setDropoffLocation("");
    setDifferentDropoff(false);
    setHasPickupInput(false);
    setHasDropoffInput(false);
    setLocationError(undefined);
    setDropdownClearance(0);
    setInputResetVersion((version) => version + 1);
    onClearSearch();
  }

  function selectService(nextServiceType: ServiceType) {
    setServiceType(nextServiceType);
    setPickupLocation("");
    setDifferentDropoff(false);
    setDropoffLocation("");
    setHasPickupInput(false);
    setHasDropoffInput(false);
    setLocationError(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (serviceType === "transfer" && !pickupLocation) {
      setLocationError("Select a pickup location from the available routes.");
      return;
    }
    if (serviceType === "transfer" && differentDropoff && !dropoffLocation) {
      setLocationError("Select a valid drop-off for this pickup location.");
      return;
    }
    setLocationError(undefined);
    onSearch({
      serviceType,
      pickupLocation: pickupLocation.trim(),
      dropoffLocation:
        serviceType === "transfer" && differentDropoff
          ? dropoffLocation.trim() || undefined
          : undefined,
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{ marginBottom: dropdownClearance }}
      className="relative z-20 mt-6 overflow-visible rounded-[1rem] border border-[#d5deea] bg-white p-4 shadow-[0_12px_32px_rgba(25,50,88,0.09)] transition-[margin] duration-200 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[#e9f2ff] text-primary">
            <MapPin aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 className="text-base font-semibold">Search your trip</h2>
            <p className="text-xs text-muted">
              Choose a service and location to update results.
            </p>
          </div>
        </div>
        {canClearSearch ||
        hasPickupInput ||
        hasDropoffInput ||
        differentDropoff ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
          >
            <RotateCcw aria-hidden="true" size={15} /> Clear trip
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "grid gap-4 lg:items-end",
          serviceType === "transfer" && differentDropoff
            ? "lg:grid-cols-[auto_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]"
            : "lg:grid-cols-[auto_minmax(15rem,1fr)_auto]",
        )}
      >
        <fieldset className="shrink-0">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Service type
          </legend>
          <div className="grid grid-cols-2 rounded-control border border-border bg-[#f2f5f9] p-1">
            {(["rental", "transfer"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={serviceType === option}
                onClick={() => selectService(option)}
                className={cn(
                  "min-h-10 rounded-[calc(var(--radius-control)-0.25rem)] px-4 text-sm font-semibold capitalize outline-none transition-[background-color,color,box-shadow] focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
                  serviceType === option
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="min-w-0 flex-1">
          {serviceType === "rental" ? (
            <Input
              label="Pickup location"
              value={pickupLocation}
              onChange={(event) => {
                setPickupLocation(event.target.value);
                setHasPickupInput(Boolean(event.target.value));
              }}
              placeholder="City, for example Lahore"
              autoComplete="off"
              className="h-11 shadow-none focus:border-primary"
            />
          ) : (
            <TransferLocationCombobox
              key={`pickup-${inputResetVersion}`}
              kind="pickup"
              value={pickupLocation}
              onInputValueChange={(value) => setHasPickupInput(Boolean(value))}
              onSelect={(value) => {
                setPickupLocation(value);
                setDropoffLocation("");
                setHasDropoffInput(false);
                setLocationError(undefined);
              }}
              onDropdownLayout={updateDropdownClearance}
            />
          )}
        </div>

        {serviceType === "transfer" && differentDropoff ? (
          <div className="min-w-0">
            <TransferLocationCombobox
              key={`${pickupLocation}-${inputResetVersion}`}
              kind="dropoff"
              value={dropoffLocation}
              pickupLocation={pickupLocation}
              disabled={!pickupLocation}
              onInputValueChange={(value) => setHasDropoffInput(Boolean(value))}
              onSelect={(value) => {
                setDropoffLocation(value);
                setLocationError(undefined);
              }}
              onDropdownLayout={updateDropdownClearance}
            />
          </div>
        ) : null}

        <Button type="submit" className="h-11 lg:min-w-32">
          <Search aria-hidden="true" size={18} />
          Search
        </Button>
      </div>

      {locationError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {locationError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={cn(
              "inline-flex items-center gap-2 font-medium",
              serviceType === "rental"
                ? "cursor-not-allowed text-muted/70"
                : "cursor-pointer text-muted",
            )}
          >
            <input
              type="checkbox"
              checked={differentDropoff}
              disabled={serviceType === "rental"}
              onChange={(event) => {
                setDifferentDropoff(event.target.checked);
                if (!event.target.checked) {
                  setDropoffLocation("");
                  setHasDropoffInput(false);
                }
              }}
              className="size-4 rounded border-border accent-[var(--accent-secondary)] focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
            />
            Different drop-off location
          </label>
          <InfoTooltip
            label={
              serviceType === "rental"
                ? "Rental searches use the pickup city."
                : "Add a destination when you want results for one exact transfer route."
            }
          />
        </div>
      </div>
    </form>
  );
}
