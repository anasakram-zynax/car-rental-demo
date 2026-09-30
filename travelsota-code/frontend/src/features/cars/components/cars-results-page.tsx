"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PremiumEmpty,
  PremiumError,
} from "@/components/ui/state/premium-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useCarLocation, useCarsSearch } from "../hooks";
import type { CarLocation, CarSearchQuery } from "../types";
import {
  decodeCarsPathValue,
  toCarsSearchQuery,
  type CarResultsContext,
} from "../utils/car-results-route";
import { CarResultCard } from "./car-result-card";
import { CarSearchForm, type CarSearchFormState } from "./car-search-form";
import { CarsPagination } from "./cars-pagination";
import {
  CarsResultsControls,
  type CarsFilterOptions,
} from "./cars-results-controls";
import { CarsSelect } from "./cars-select";

const ease = [0.16, 1, 0.3, 1] as const;

function localDateTime(value: string) {
  const date = new Date(decodeCarsPathValue(value));
  if (!Number.isFinite(date.getTime())) return { date: "", time: "" };
  const two = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`,
    time: `${two(date.getHours())}:${two(date.getMinutes())}`,
  };
}

function pendingLocation(id: string, label: string): CarLocation {
  return {
    id,
    identity: id,
    name: label,
    label,
    city: "",
    region: null,
    country: "",
    type: "city",
    code: null,
  };
}

export function CarsResultsPage({ context }: { context: CarResultsContext }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const query = useMemo(
    () => toCarsSearchQuery(context, params),
    [context, params],
  );
  const results = useCarsSearch(query);
  const categoryResults = useCarsSearch({
    ...toCarsSearchQuery(context, new URLSearchParams()),
    pageSize: 100,
  });
  const pickup = useCarLocation(context.pickupLocationId);
  const otherId =
    context.serviceType === "rental"
      ? context.returnLocationId
      : context.dropoffLocationId;
  const other = useCarLocation(
    otherId === context.pickupLocationId ? undefined : otherId,
  );
  const pickupLocation =
    pickup.data ??
    pendingLocation(context.pickupLocationId, "Loading location…");
  const otherLocation =
    otherId === context.pickupLocationId
      ? pickupLocation
      : (other.data ?? pendingLocation(otherId, "Loading location…"));
  const initialState = useMemo<CarSearchFormState>(() => {
    const pickupAt = localDateTime(context.pickupAt);
    const dropoffAt =
      context.serviceType === "rental"
        ? localDateTime(context.dropoffAt)
        : undefined;
    return {
      mode: context.serviceType,
      pickup: pickupLocation,
      pickupLabel: pickupLocation.label,
      returnLocation:
        context.serviceType === "rental" &&
        context.returnLocationId !== context.pickupLocationId
          ? otherLocation
          : null,
      returnLabel:
        context.serviceType === "rental" &&
        context.returnLocationId !== context.pickupLocationId
          ? otherLocation.label
          : "",
      differentReturn:
        context.serviceType === "rental" &&
        context.returnLocationId !== context.pickupLocationId,
      dropoff: context.serviceType === "transfer" ? otherLocation : null,
      dropoffLabel:
        context.serviceType === "transfer" ? otherLocation.label : "",
      pickupDate: pickupAt.date,
      pickupTime: pickupAt.time,
      dropoffDate: dropoffAt?.date ?? pickupAt.date,
      dropoffTime: dropoffAt?.time ?? pickupAt.time,
    };
  }, [context, otherLocation, pickupLocation]);
  const filterOptions = useMemo<CarsFilterOptions>(() => {
    const fleets =
      categoryResults.data?.items.map((item) =>
        item.serviceType === "rental" ? item : item.fleet,
      ) ?? [];
    const categories = new Set(fleets.map((fleet) => fleet.category));
    const selected = params.get("category");
    if (selected) categories.add(selected);
    const transmissions = new Set(
      fleets
        .map((fleet) => fleet.transmission)
        .filter((value): value is string => Boolean(value)),
    );
    const currencies = new Set(
      categoryResults.data?.items.map((item) => item.currency) ?? [],
    );
    const sourceCurrency = currencies.size === 1 ? [...currencies][0] : null;
    const currencySymbol = sourceCurrency
      ? (new Intl.NumberFormat("en", {
          style: "currency",
          currency: sourceCurrency,
          currencyDisplay: "narrowSymbol",
        })
          .formatToParts(0)
          .find((part) => part.type === "currency")?.value ?? sourceCurrency)
      : "";
    return {
      categories: [...categories].sort(),
      transmissions: [...transmissions].sort(),
      passengerCapacities: [
        ...new Set(fleets.map((fleet) => fleet.passengerCapacity)),
      ].sort((a, b) => a - b),
      luggageCapacities: [
        ...new Set(
          fleets
            .map((fleet) => fleet.luggageCapacity)
            .filter((value): value is number => value != null),
        ),
      ].sort((a, b) => a - b),
      priceMax: Math.max(
        categoryResults.data ? 1 : 500,
        Math.ceil(
          Math.max(
            ...(categoryResults.data?.items.map((item) => item.price) ?? [1]),
          ) / 10,
        ) * 10,
      ),
      resultCount: categoryResults.data?.total ?? 0,
      currencySymbol,
    };
  }, [categoryResults.data, params]);
  const setSort = (sort: string) => {
    const next = new URLSearchParams(params.toString());
    if (sort === "recommended") next.delete("sort");
    else next.set("sort", sort);
    next.set("page", "1");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="min-h-dvh bg-slate-50/60">
      <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-9 sm:px-6 lg:px-8">
        <CarSearchForm
          key={`${pathname}-${pickupLocation.label}-${otherLocation.label}`}
          initialState={initialState}
        />
        <main className="mt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Available cars
              </h1>
              <p className="text-sm text-slate-500">
                {results.data
                  ? `${results.data.total} result${results.data.total === 1 ? "" : "s"}`
                  : "Finding the best available cars…"}
              </p>
            </div>
            <div className="w-full sm:w-56">
              <CarsSelect
                ariaLabel="Sort cars"
                value={
                  (params.get("sort") as CarSearchQuery["sort"]) ??
                  "recommended"
                }
                options={[
                  { value: "recommended", label: "Recommended" },
                  { value: "price_asc", label: "Price: Low to High" },
                  { value: "price_desc", label: "Price: High to Low" },
                ]}
                onChange={setSort}
              />
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
            <div className="custom-scrollbar lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:self-start lg:overflow-y-auto lg:pr-1">
              <CarsResultsControls options={filterOptions} />
            </div>
            <section className="min-w-0" aria-live="polite">
              {results.isFetching && <ResultsSkeleton />}
              {results.isError && (
                <PremiumError
                  message={
                    (results.error as { message?: string }).message ??
                    "Cars could not be loaded."
                  }
                  onRetry={() => void results.refetch()}
                />
              )}
              {!results.isFetching && results.data?.items.length === 0 && (
                <PremiumEmpty
                  title="No cars found"
                  message="Try adjusting the filters or search details."
                />
              )}
              {!results.isFetching &&
                results.data &&
                results.data.items.length > 0 && (
                  <>
                    <motion.div
                      className="grid gap-4"
                      initial="hidden"
                      animate="show"
                      variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: 0.05 } },
                      }}
                    >
                      {results.data.items.map((result) => {
                        const id =
                          result.serviceType === "rental"
                            ? result.id
                            : result.packageId;
                        return (
                          <motion.div
                            key={id}
                            variants={{
                              hidden: { opacity: 0, y: 10 },
                              show: { opacity: 1, y: 0 },
                            }}
                            transition={{ duration: 0.4, ease }}
                          >
                            <CarResultCard
                              result={result}
                              detailsHref={`${pathname}/car/${encodeURIComponent(id)}${params.toString() ? `?${params.toString()}` : ""}`}
                            />
                          </motion.div>
                        );
                      })}
                    </motion.div>
                    <CarsPagination
                      page={results.data.page}
                      totalPages={
                        results.data.totalPages ??
                        Math.ceil(results.data.total / results.data.pageSize)
                      }
                    />
                  </>
                )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: index * 0.04 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:flex sm:gap-5"
        >
          <Skeleton variant="rect" className="h-44 sm:w-72" />
          <div className="mt-4 flex-1 space-y-4 sm:mt-0">
            <Skeleton width="45%" />
            <Skeleton width="75%" />
            <Skeleton width="60%" />
            <Skeleton width="35%" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
