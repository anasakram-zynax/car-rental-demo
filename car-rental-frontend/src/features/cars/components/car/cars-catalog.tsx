"use client";

import {
  AlertTriangle,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  SearchX,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCars } from "@/features/cars/hooks/use-cars";
import { useCarFilterOptions } from "@/features/cars/hooks/use-car-filter-options";
import type {
  CarSearchSort,
  SearchCarsParams,
  ServiceType,
} from "@/features/cars/types/car.types";
import {
  CarCatalogSearch,
  type CatalogSearchValues,
} from "./car-catalog-search";
import { CarSearchForm } from "./car-search-form";
import { CarCard, CarCardSkeleton } from "./car-result-card";

const CATALOG_LIMIT = 6;
const SORT_OPTIONS: ReadonlyArray<{ value: CarSearchSort; label: string }> = [
  { value: "price_asc", label: "Price low to high" },
  { value: "price_desc", label: "Price high to low" },
  { value: "newest", label: "Newest" },
  { value: "name_asc", label: "Name" },
];
const SORT_VALUES = new Set<CarSearchSort>(
  SORT_OPTIONS.map(({ value }) => value),
);

function parseNonNegativeNumber(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveInteger(value: string | null, fallback?: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readSort(value: string | null): CarSearchSort {
  return value && SORT_VALUES.has(value as CarSearchSort)
    ? (value as CarSearchSort)
    : "newest";
}

function LoadingGrid() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: CATALOG_LIMIT }, (_, index) => (
        <CarCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function CarsCatalogFallback() {
  return (
    <div className="mt-6">
      <div className="h-44 animate-pulse rounded-card border border-border bg-white" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="hidden h-[30rem] animate-pulse rounded-card border border-border bg-white lg:block" />
        <div>
          <div className="mb-4 h-32 animate-pulse rounded-card border border-border bg-white" />
          <LoadingGrid />
        </div>
      </div>
    </div>
  );
}

interface ResultsToolbarProps {
  resultCount?: number;
  isFetching: boolean;
  searchQuery: string;
  sort: CarSearchSort;
  onSearchSubmit: (value?: string) => void;
  onSortChange: (value: CarSearchSort) => void;
}

function ResultsToolbar({
  isFetching,
  onSearchSubmit,
  onSortChange,
  resultCount,
  searchQuery,
  sort,
}: ResultsToolbarProps) {
  const [searchInput, setSearchInput] = useState(searchQuery);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit(searchInput.trim() || undefined);
  }

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
            Available vehicles
          </p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.025em]">
            {resultCount === undefined
              ? "Loading cars…"
              : `${resultCount} ${resultCount === 1 ? "car" : "cars"} found`}
            {resultCount !== undefined && isFetching ? (
              <span className="ml-2 text-xs font-medium text-muted">
                Updating…
              </span>
            ) : null}
          </p>
        </div>
        <label className="grid gap-1.5 text-xs font-medium text-muted sm:w-56">
          Sort by
          <select
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as CarSearchSort)
            }
            className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-[var(--ring)]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form
        onSubmit={submitSearch}
        className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Input
          label="Search car name or model"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="For example, Toyota or Corolla"
          className="h-10 shadow-none focus:border-primary"
        />
        <Button type="submit" className="h-10">
          <Search aria-hidden="true" size={17} />
          Search
        </Button>
      </form>
    </div>
  );
}

function getVisiblePages(page: number, totalPages: number) {
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
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

  const serviceType: ServiceType =
    searchParams.get("serviceType") === "transfer" ? "transfer" : "rental";
  const city =
    serviceType === "rental"
      ? searchParams.get("city")?.trim() || undefined
      : undefined;
  const pickupLocation =
    serviceType === "transfer"
      ? searchParams.get("pickupLocation")?.trim() || undefined
      : undefined;
  const dropoffLocation =
    serviceType === "transfer"
      ? searchParams.get("dropoffLocation")?.trim() || undefined
      : undefined;
  const transmission = searchParams.get("transmission")?.trim() || undefined;
  const fuelType = searchParams.get("fuelType")?.trim() || undefined;
  const minBaggage = parsePositiveInteger(searchParams.get("minBaggage"));
  const rawMinPrice = parseNonNegativeNumber(searchParams.get("minPrice"));
  const rawMaxPrice = parseNonNegativeNumber(searchParams.get("maxPrice"));
  const minPrice =
    rawMinPrice !== undefined && rawMaxPrice !== undefined
      ? Math.min(rawMinPrice, rawMaxPrice)
      : rawMinPrice;
  const maxPrice =
    rawMinPrice !== undefined && rawMaxPrice !== undefined
      ? Math.max(rawMinPrice, rawMaxPrice)
      : rawMaxPrice;
  const searchQuery = searchParams.get("search")?.trim() || undefined;
  const sort = readSort(searchParams.get("sort"));
  const page = parsePositiveInteger(searchParams.get("page"), 1) ?? 1;

  const queryParams = useMemo<SearchCarsParams>(
    () => ({
      serviceType,
      city,
      pickupLocation,
      dropoffLocation,
      transmission,
      fuelType,
      minBaggage,
      minPrice,
      maxPrice,
      search: searchQuery,
      sort,
      page,
      limit: CATALOG_LIMIT,
    }),
    [
      city,
      dropoffLocation,
      fuelType,
      maxPrice,
      minBaggage,
      minPrice,
      page,
      pickupLocation,
      searchQuery,
      serviceType,
      sort,
      transmission,
    ],
  );
  const resultQuery = useCars(queryParams);
  const filterOptionsQuery = useCarFilterOptions(serviceType);
  const result = resultQuery.data;
  const cars = useMemo(() => result?.cars ?? [], [result]);
  const currency =
    cars.find((car) => car.serviceType === "transfer")?.transferPackages[0]
      ?.currency ??
    cars[0]?.currency ??
    "USD";
  const filterOptions = filterOptionsQuery.data;
  const priceBounds: [number, number] = [0, filterOptions?.maxPrice ?? 0];
  const committedPrice: [number, number] = [
    clamp(minPrice ?? priceBounds[0], priceBounds[0], priceBounds[1]),
    clamp(maxPrice ?? priceBounds[1], priceBounds[0], priceBounds[1]),
  ];
  const priceValue =
    draftPrice?.source === urlKey ? draftPrice.value : committedPrice;
  const hasActiveFilters = Boolean(
    transmission ||
    fuelType ||
    minBaggage !== undefined ||
    minPrice !== undefined ||
    maxPrice !== undefined,
  );
  const hasLocationSearch = Boolean(city || pickupLocation || dropoffLocation);
  const hasActiveResultFilters = Boolean(
    hasActiveFilters || searchQuery || sort !== "newest",
  );
  const hasActiveSearch = hasLocationSearch || hasActiveResultFilters;

  useEffect(() => {
    if (!filterOptions) return;
    const next = new URLSearchParams(urlKey);
    let changed = false;
    const hasOption = (options: string[], value: string) =>
      options.some((option) => option.toLowerCase() === value.toLowerCase());

    if (
      transmission &&
      !hasOption(filterOptions.transmissionTypes, transmission)
    ) {
      next.delete("transmission");
      changed = true;
    }
    if (fuelType && !hasOption(filterOptions.fuelTypes, fuelType)) {
      next.delete("fuelType");
      changed = true;
    }
    if (minBaggage !== undefined && minBaggage > filterOptions.maxBaggage) {
      next.delete("minBaggage");
      changed = true;
    }
    if (
      (minPrice ?? 0) > filterOptions.maxPrice ||
      (maxPrice ?? 0) > filterOptions.maxPrice
    ) {
      next.delete("minPrice");
      next.delete("maxPrice");
      changed = true;
    }
    if (changed) {
      next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [
    filterOptions,
    fuelType,
    maxPrice,
    minBaggage,
    minPrice,
    pathname,
    router,
    transmission,
    urlKey,
  ]);

  function navigate(next: URLSearchParams) {
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function updateParam(key: string, value?: string | number, resetPage = true) {
    const next = new URLSearchParams(urlKey);
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
    if (resetPage) next.delete("page");
    navigate(next);
  }

  function applyMainSearch(values: CatalogSearchValues) {
    const next = new URLSearchParams(urlKey);
    next.set("serviceType", values.serviceType);
    next.delete("city");
    next.delete("pickupLocation");
    next.delete("dropoffLocation");
    if (values.serviceType !== serviceType) {
      next.delete("minPrice");
      next.delete("maxPrice");
    }
    if (values.serviceType === "rental" && values.pickupLocation)
      next.set("city", values.pickupLocation);
    if (values.serviceType === "transfer" && values.pickupLocation)
      next.set("pickupLocation", values.pickupLocation);
    if (values.serviceType === "transfer" && values.dropoffLocation)
      next.set("dropoffLocation", values.dropoffLocation);
    next.delete("page");
    navigate(next);
  }

  function updatePrice(value: [number, number]) {
    const next = new URLSearchParams(urlKey);
    if (value[0] > priceBounds[0]) next.set("minPrice", String(value[0]));
    else next.delete("minPrice");
    if (value[1] < priceBounds[1]) next.set("maxPrice", String(value[1]));
    else next.delete("maxPrice");
    next.delete("page");
    navigate(next);
  }

  function clearLocationSearch() {
    const next = new URLSearchParams(urlKey);
    next.delete("city");
    next.delete("pickupLocation");
    next.delete("dropoffLocation");
    next.delete("page");
    navigate(next);
  }

  function clearResultFilters() {
    const next = new URLSearchParams(urlKey);
    [
      "transmission",
      "fuelType",
      "minBaggage",
      "minPrice",
      "maxPrice",
      "search",
      "sort",
      "page",
    ].forEach((key) => next.delete(key));
    setDraftPrice(null);
    navigate(next);
  }

  const filterForm = (
    <CarSearchForm
      transmissionOptions={filterOptions?.transmissionTypes ?? []}
      fuelTypeOptions={filterOptions?.fuelTypes ?? []}
      selectedTransmission={transmission}
      selectedFuelType={fuelType}
      selectedMinBaggage={minBaggage}
      maxBaggage={filterOptions?.maxBaggage ?? 0}
      currency={currency}
      priceBounds={priceBounds}
      priceValue={priceValue}
      hasActiveFilters={hasActiveResultFilters}
      disabled={filterOptionsQuery.isPending || filterOptionsQuery.isError}
      onTransmissionChange={(value) => updateParam("transmission", value)}
      onFuelTypeChange={(value) => updateParam("fuelType", value)}
      onMinBaggageChange={(value) => updateParam("minBaggage", value)}
      onPriceChange={(value) => setDraftPrice({ source: urlKey, value })}
      onPriceCommit={(value) => {
        setDraftPrice(null);
        updatePrice(value);
      }}
      onReset={clearResultFilters}
    />
  );

  return (
    <div>
      <CarCatalogSearch
        key={`${serviceType}-${city ?? pickupLocation ?? ""}-${dropoffLocation ?? ""}`}
        serviceType={serviceType}
        pickupLocation={city ?? pickupLocation ?? ""}
        dropoffLocation={dropoffLocation}
        onSearch={applyMainSearch}
        onClearSearch={clearLocationSearch}
        canClearSearch={hasLocationSearch}
      />

      <details className="group relative z-10 mt-5 rounded-card border border-border bg-white shadow-sm lg:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Filter aria-hidden="true" size={18} /> Filter cars
          </span>
          <span className="text-xs font-medium text-muted group-open:hidden">
            {hasActiveResultFilters ? "Filters applied" : "Show"}
          </span>
          <span className="hidden text-xs font-medium text-muted group-open:inline">
            Hide
          </span>
        </summary>
        <div className="border-t border-border p-5">{filterForm}</div>
      </details>

      <div className="relative z-10 mt-5 grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside
          className="sticky top-4 hidden lg:block"
          aria-label="Car filters"
        >
          <Card className="border-border bg-white shadow-sm" padding="md">
            {filterForm}
          </Card>
        </aside>

        <section aria-live="polite" aria-busy={resultQuery.isFetching}>
          <ResultsToolbar
            key={searchQuery ?? "empty-search"}
            resultCount={result?.total}
            isFetching={resultQuery.isFetching}
            searchQuery={searchQuery ?? ""}
            sort={sort}
            onSearchSubmit={(value) => updateParam("search", value)}
            onSortChange={(value) => updateParam("sort", value)}
          />

          {resultQuery.isPending ? (
            <div className="mt-4">
              <LoadingGrid />
            </div>
          ) : resultQuery.isError ? (
            <Card
              padding="lg"
              className="mt-4 border-border bg-white text-center shadow-sm"
            >
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-900/[0.08] text-danger">
                <AlertTriangle aria-hidden="true" size={22} />
              </span>
              <h2 className="mt-5 text-xl font-semibold">
                The fleet could not be loaded
              </h2>
              <p className="mx-auto mt-2 max-w-lg leading-7 text-muted">
                The catalog service is not available right now. Check the
                connection and try again.
              </p>
              <Button
                className="mt-6"
                onClick={() => void resultQuery.refetch()}
              >
                Try again
              </Button>
            </Card>
          ) : (
            <>
              {cars.length > 0 ? (
                <>
                  <div className="mt-4 grid gap-4">
                    {cars.map((car, index) => (
                      <CarCard
                        key={car.id}
                        car={car}
                        index={index}
                        pickupLocation={pickupLocation}
                        dropoffLocation={dropoffLocation}
                      />
                    ))}
                  </div>

                  {(result?.totalPages ?? 1) > 1 ? (
                    <nav
                      className="mt-6 flex flex-wrap items-center justify-center gap-2 rounded-card border border-border bg-white p-3 shadow-sm"
                      aria-label="Car results pages"
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => updateParam("page", page - 1, false)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft aria-hidden="true" size={16} /> Previous
                      </Button>
                      {getVisiblePages(page, result?.totalPages ?? 1).map(
                        (pageNumber) => (
                          <Button
                            key={pageNumber}
                            variant={pageNumber === page ? "primary" : "ghost"}
                            size="sm"
                            onClick={() =>
                              updateParam("page", pageNumber, false)
                            }
                            aria-current={
                              pageNumber === page ? "page" : undefined
                            }
                            aria-label={`Page ${pageNumber}`}
                          >
                            {pageNumber}
                          </Button>
                        ),
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page >= (result?.totalPages ?? 1)}
                        onClick={() => updateParam("page", page + 1, false)}
                        aria-label="Next page"
                      >
                        Next <ChevronRight aria-hidden="true" size={16} />
                      </Button>
                    </nav>
                  ) : null}
                </>
              ) : (
                <Card
                  padding="lg"
                  className="mt-4 border-border bg-white text-center shadow-sm"
                >
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-black/[0.05] text-muted">
                    {hasActiveSearch ? (
                      <SearchX aria-hidden="true" size={22} />
                    ) : (
                      <CarFront aria-hidden="true" size={22} />
                    )}
                  </span>
                  <h2 className="mt-5 text-xl font-semibold">
                    {hasActiveSearch
                      ? "No cars match your search"
                      : "No cars are available yet"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md leading-7 text-muted">
                    {hasActiveSearch
                      ? "Try a different location or widen the vehicle and price filters."
                      : "The fleet is currently empty. Please check back later."}
                  </p>
                  {hasActiveSearch ? (
                    <Button
                      className="mt-6"
                      variant="secondary"
                      onClick={
                        hasLocationSearch
                          ? clearLocationSearch
                          : clearResultFilters
                      }
                    >
                      {hasLocationSearch
                        ? "Clear location search"
                        : "Clear filters"}
                    </Button>
                  ) : null}
                </Card>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
