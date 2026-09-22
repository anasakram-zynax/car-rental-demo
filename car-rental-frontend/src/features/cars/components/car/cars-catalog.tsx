"use client";

import { AlertTriangle, CarFront, Filter, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCars } from "@/features/cars/hooks/use-cars";
import type { SearchCarsParams } from "@/features/cars/types/car.types";
import { CarCard, CarCardSkeleton } from "./car-result-card";
import { CarSearchForm } from "./car-search-form";

const CATALOG_LIMIT = 100;

function parsePrice(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function LoadingGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <CarCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function CarsCatalogFallback() {
  return (
    <div className="mt-10 grid gap-7 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <div className="hidden h-96 animate-pulse rounded-card border border-white/70 bg-white/55 lg:block" />
      <div>
        <div className="mb-5 h-5 w-32 animate-pulse rounded-full bg-black/[0.08]" />
        <LoadingGrid />
      </div>
    </div>
  );
}

interface FilterValues {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function CarsCatalog() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const [draftPrice, setDraftPrice] = useState<{
    source: string;
    value: [number, number];
  } | null>(null);

  const city = searchParams.get("city")?.trim() || undefined;
  const rawMinPrice = parsePrice(searchParams.get("minPrice"));
  const rawMaxPrice = parsePrice(searchParams.get("maxPrice"));
  const minPrice =
    rawMinPrice !== undefined && rawMaxPrice !== undefined
      ? Math.min(rawMinPrice, rawMaxPrice)
      : rawMinPrice;
  const maxPrice =
    rawMinPrice !== undefined && rawMaxPrice !== undefined
      ? Math.max(rawMinPrice, rawMaxPrice)
      : rawMaxPrice;

  const inventoryParams = useMemo<SearchCarsParams>(
    () => ({ page: 1, limit: CATALOG_LIMIT }),
    [],
  );
  const resultParams = useMemo<SearchCarsParams>(
    () => ({ city, minPrice, maxPrice, page: 1, limit: CATALOG_LIMIT }),
    [city, maxPrice, minPrice],
  );
  const inventoryQuery = useCars(inventoryParams);
  const resultQuery = useCars(resultParams);

  const inventory = inventoryQuery.data?.cars;
  const cities = useMemo(
    () =>
      inventory
        ? [...new Set(inventory.map((car) => car.city))].sort()
        : [],
    [inventory],
  );
  const currency = inventory?.[0]?.currency ?? "USD";
  const priceBounds = useMemo<[number, number]>(() => {
    if (!inventory?.length) return [0, 1];
    const prices = inventory.map((car) => car.dailyPrice);
    const minimum = Math.floor(Math.min(...prices) / 5) * 5;
    const maximum = Math.ceil(Math.max(...prices) / 5) * 5;
    return minimum === maximum ? [minimum, maximum + 5] : [minimum, maximum];
  }, [inventory]);
  const committedPrice: [number, number] = [
    clamp(minPrice ?? priceBounds[0], priceBounds[0], priceBounds[1]),
    clamp(maxPrice ?? priceBounds[1], priceBounds[0], priceBounds[1]),
  ];
  const priceValue =
    draftPrice?.source === urlKey ? draftPrice.value : committedPrice;
  const hasActiveFilters = Boolean(
    city || minPrice !== undefined || maxPrice !== undefined,
  );

  function updateFilters(values: FilterValues) {
    const next = new URLSearchParams();
    if (values.city) next.set("city", values.city);
    if (
      values.minPrice !== undefined &&
      values.minPrice > priceBounds[0]
    ) {
      next.set("minPrice", String(values.minPrice));
    }
    if (
      values.maxPrice !== undefined &&
      values.maxPrice < priceBounds[1]
    ) {
      next.set("maxPrice", String(values.maxPrice));
    }

    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function resetFilters() {
    setDraftPrice(null);
    router.push(pathname, { scroll: false });
  }

  const filterForm = (
    <CarSearchForm
      cities={cities}
      selectedCity={city}
      currency={currency}
      priceBounds={priceBounds}
      priceValue={priceValue}
      hasActiveFilters={hasActiveFilters}
      disabled={!inventory?.length}
      onCityChange={(nextCity) =>
        updateFilters({ city: nextCity, minPrice, maxPrice })
      }
      onPriceChange={(value) => setDraftPrice({ source: urlKey, value })}
      onPriceCommit={(value) => {
        setDraftPrice(null);
        updateFilters({ city, minPrice: value[0], maxPrice: value[1] });
      }}
      onReset={resetFilters}
    />
  );

  if (inventoryQuery.isPending || resultQuery.isPending) {
    return <CarsCatalogFallback />;
  }

  if (inventoryQuery.isError || resultQuery.isError) {
    return (
      <Card variant="elevated" padding="lg" className="mt-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-900/[0.08] text-danger">
          <AlertTriangle aria-hidden="true" size={22} />
        </span>
        <h2 className="mt-5 text-xl font-semibold">The fleet could not be loaded</h2>
        <p className="mx-auto mt-2 max-w-lg leading-7 text-muted">
          The catalog service is not available right now. Check the connection
          and try again without leaving this page.
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            void inventoryQuery.refetch();
            void resultQuery.refetch();
          }}
        >
          Try again
        </Button>
      </Card>
    );
  }

  const result = resultQuery.data;
  const cars = result?.cars ?? [];

  return (
    <div className="mt-10">
      <details className="group mb-6 rounded-card border border-white/80 bg-surface-glass shadow-card backdrop-blur-md lg:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Filter aria-hidden="true" size={18} />
            Filter cars
          </span>
          <span className="text-xs font-medium text-muted group-open:hidden">
            {hasActiveFilters ? "Filters applied" : "Show"}
          </span>
          <span className="hidden text-xs font-medium text-muted group-open:inline">
            Hide
          </span>
        </summary>
        <div className="border-t border-border/70 p-5">{filterForm}</div>
      </details>

      <div className="grid items-start gap-7 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="sticky top-6 hidden lg:block" aria-label="Car filters">
          <Card variant="glass" padding="md">
            {filterForm}
          </Card>
        </aside>

        <section aria-live="polite" aria-busy={resultQuery.isFetching}>
          <div className="mb-5 flex min-h-8 items-center justify-between gap-4">
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">{result?.total ?? 0}</span>{" "}
              {result?.total === 1 ? "car" : "cars"} available
            </p>
            {resultQuery.isFetching ? (
              <span className="text-xs font-medium text-muted">Updating…</span>
            ) : null}
          </div>

          {cars.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {cars.map((car, index) => (
                <CarCard key={car.id} car={car} index={index} />
              ))}
            </div>
          ) : (
            <Card variant="elevated" padding="lg" className="text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-black/[0.05] text-muted">
                {hasActiveFilters ? (
                  <SearchX aria-hidden="true" size={22} />
                ) : (
                  <CarFront aria-hidden="true" size={22} />
                )}
              </span>
              <h2 className="mt-5 text-xl font-semibold">
                {hasActiveFilters
                  ? "No cars match these filters"
                  : "No cars are available yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md leading-7 text-muted">
                {hasActiveFilters
                  ? "Try widening the price range or choosing another location."
                  : "The fleet is currently empty. Please check back later."}
              </p>
              {hasActiveFilters ? (
                <Button className="mt-6" variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : null}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
