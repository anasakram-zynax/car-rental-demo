"use client";
import { Suspense, use, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PremiumError } from "@/components/ui/state/premium-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrencyDisplay } from "@/context/CurrencyContext";
import { useCarLocation, useCarsSearch } from "@/features/cars/hooks";
import { CarGallery } from "@/features/cars/components/car-gallery";
import type { CarSearchQuery } from "@/features/cars/types";
import {
  decodeCarsPathValue,
  toCarsSearchQuery,
  type CarResultsContext,
} from "@/features/cars/utils/car-results-route";

const ease = [0.16, 1, 0.3, 1] as const;

function formatSchedule(value: string) {
  const date = new Date(decodeCarsPathValue(value));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

function iso(date: string | null, time: string | null) {
  if (!date || !time) return "";
  const value = new Date(`${date}T${time}:00`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : "";
}
function optionalNumber(params: URLSearchParams, key: string, minimum: number) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : undefined;
}
function Detail({ id, context }: { id: string; context?: CarResultsContext }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { formatPrice } = useCurrencyDisplay();
  const [selected, setSelected] = useState(false);
  const query = useMemo<CarSearchQuery | null>(() => {
    if (context)
      return { ...toCarsSearchQuery(context, params), page: 1, pageSize: 100 };
    const serviceType = params.get("serviceType");
    const pickupAt = iso(params.get("pickupDate"), params.get("pickupTime"));
    if ((serviceType !== "rental" && serviceType !== "transfer") || !pickupAt)
      return null;
    const common = {
      serviceType: serviceType as "rental" | "transfer",
      pickupAt,
      page: 1,
      pageSize: 100,
      minPrice: optionalNumber(params, "minPrice", 0),
      maxPrice: optionalNumber(params, "maxPrice", 0),
      transmission: params.get("transmission") || undefined,
      passengerCapacity: optionalNumber(params, "passengerCapacity", 1),
      luggageCapacity: optionalNumber(params, "luggageCapacity", 1),
      category: params.get("category") || undefined,
      sort: (params.get("sort") as CarSearchQuery["sort"]) || "recommended",
    };
    if (serviceType === "rental")
      return {
        ...common,
        locationId: params.get("locationId") || undefined,
        dropoffAt: iso(params.get("dropoffDate"), params.get("dropoffTime")),
      };
    return {
      ...common,
      pickupLocationId: params.get("pickupLocationId") || undefined,
      dropoffLocationId: params.get("dropoffLocationId") || undefined,
    };
  }, [context, params]);
  const search = useCarsSearch(query);
  const differentReturnLocationId =
    context?.serviceType === "rental" &&
    context.returnLocationId !== context.pickupLocationId
      ? context.returnLocationId
      : undefined;
  const returnLocation = useCarLocation(differentReturnLocationId);
  const reviewing = params.get("step") === "review";
  const result = search.data?.items.find(
    (item) =>
      (item.serviceType === "rental" ? item.id : item.packageId) ===
      decodeURIComponent(id),
  );
  if (search.isLoading)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton variant="rect" className="h-80" />
        <Skeleton width="45%" />
        <Skeleton width="70%" />
      </div>
    );
  if (search.isError)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <PremiumError
          message={
            (search.error as { message?: string }).message ??
            "Car details could not be loaded."
          }
          onRetry={() => void search.refetch()}
        />
      </div>
    );
  if (!result)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Car unavailable</h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 text-sm font-semibold text-brand-teal"
        >
          Back to results
        </button>
      </div>
    );
  const fleet = result.serviceType === "rental" ? result : result.fleet;
  const currency =
    result.serviceType === "rental" ? fleet.currency : result.currency;
  const images = [...(fleet.images ?? [])].sort((a, b) => a.order - b.order);
  const pickupAt = context?.pickupAt ?? query?.pickupAt;
  const dropoffAt =
    context?.serviceType === "rental"
      ? context.dropoffAt
      : query?.serviceType === "rental"
        ? query.dropoffAt
        : undefined;
  const rentalDays =
    result.serviceType === "rental" && pickupAt && dropoffAt
      ? Math.max(
          1,
          Math.ceil(
            (new Date(decodeCarsPathValue(dropoffAt)).getTime() -
              new Date(decodeCarsPathValue(pickupAt)).getTime()) /
              86_400_000,
          ),
        )
      : 1;
  const journey =
    result.serviceType === "transfer"
      ? [
          ["Pick-up", result.pickupLocation.label],
          ["Drop-off", result.dropoffLocation.label],
          ...(pickupAt ? [["Date & time", formatSchedule(pickupAt)]] : []),
        ]
      : [
          ["Pick-up", fleet.location.label],
          [
            "Return",
            differentReturnLocationId
              ? (returnLocation.data?.label ?? "Loading return location…")
              : fleet.location.label,
          ],
          ...(pickupAt ? [["Pick-up time", formatSchedule(pickupAt)]] : []),
          ...(dropoffAt ? [["Drop-off time", formatSchedule(dropoffAt)]] : []),
        ];
  const checkoutParams = new URLSearchParams();
  const detailParams = new URLSearchParams(params.toString());
  detailParams.delete("step");
  checkoutParams.set(
    "returnTo",
    `${pathname}${detailParams.size ? `?${detailParams.toString()}` : ""}`,
  );
  if (context) {
    checkoutParams.set("serviceType", context.serviceType);
    checkoutParams.set("pickupLocationId", context.pickupLocationId);
    checkoutParams.set("pickupAt", decodeCarsPathValue(context.pickupAt));
    if (context.serviceType === "rental") {
      checkoutParams.set("returnLocationId", context.returnLocationId);
      checkoutParams.set("dropoffAt", decodeCarsPathValue(context.dropoffAt));
    } else {
      checkoutParams.set("dropoffLocationId", context.dropoffLocationId);
    }
  }
  const checkoutHref = `/booking/cars/${encodeURIComponent(decodeURIComponent(id))}/details?${checkoutParams.toString()}`;
  return (
    <div className="min-h-dvh bg-white pb-32">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="mb-5"
        >
          <button
            type="button"
            onClick={() => router.push("/cars/search")}
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand-teal/10 bg-white px-3 text-xs font-semibold text-brand-teal transition hover:-translate-y-0.5 hover:border-brand-teal/40"
          >
            <span aria-hidden>←</span> Back to results
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-brand-teal">
              {fleet.category}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-600">
              {result.serviceType}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
            {fleet.displayName}
          </h1>
          <p className="mt-1.5 text-sm text-[#7d7d7d]">
            {result.serviceType === "transfer"
              ? `${result.pickupLocation.label} → ${result.dropoffLocation.label}`
              : fleet.location.label}
          </p>
        </motion.header>
        <CarGallery images={images} name={fleet.displayName} />
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease, delay: 0.08 }}
          className="mt-8 border-y border-brand-teal/10 py-8"
        >
          <h2 className="text-lg font-bold tracking-tight text-charcoal">
            About this car
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#545454]">
            {fleet.description ??
              `${fleet.displayName} is available for this ${result.serviceType} journey.`}
          </p>
        </motion.section>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.1 }}
            className={`grid gap-8 ${fleet.amenities.length > 0 ? "sm:grid-cols-2" : ""}`}
          >
            <div>
              <h2 className="text-lg font-bold tracking-tight text-charcoal">
                Vehicle details
              </h2>
              <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <DetailItem
                  label="Passengers"
                  value={`${fleet.passengerCapacity}`}
                  path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z"
                />
                <DetailItem
                  label="Luggage"
                  value={`${fleet.luggageCapacity ?? "—"}`}
                  path="M6.75 7.5h10.5a2.25 2.25 0 012.25 2.25v8.25a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V9.75A2.25 2.25 0 016.75 7.5zm2.25 0V5.25A2.25 2.25 0 0111.25 3h1.5A2.25 2.25 0 0115 5.25V7.5"
                />
                <DetailItem
                  label="Transmission"
                  value={fleet.transmission ?? "—"}
                  path="M12 3v18m-4.5-6H6a3 3 0 010-6h1.5m9 0H18a3 3 0 010 6h-1.5"
                />
                {fleet.brand && (
                  <DetailItem
                    label="Brand"
                    value={fleet.brand}
                    path="M3.75 12h16.5M6 16.5h.008v.008H6V16.5zm12 0h.008v.008H18V16.5zM5.25 8.25l1.4-3.15A2.25 2.25 0 018.706 3.75h6.588a2.25 2.25 0 012.057 1.35l1.399 3.15M4.5 8.25h15A1.5 1.5 0 0121 9.75v7.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.25v-7.5a1.5 1.5 0 011.5-1.5z"
                  />
                )}
                {fleet.model && (
                  <DetailItem
                    label="Model"
                    value={fleet.model}
                    path="M6.429 9.75L2.25 12l4.179 2.25m0-4.5L12 6.75l5.571 3m-11.142 0L12 12.75m5.571-3L21.75 12l-4.179 2.25m0-4.5L12 12.75m5.571 1.5L12 17.25l-5.571-3M12 12.75v4.5"
                  />
                )}
              </div>
            </div>
            {fleet.amenities.length > 0 && (
              <div className="sm:border-l sm:border-brand-teal/10 sm:pl-8">
                <h2 className="text-lg font-bold tracking-tight text-charcoal">
                  Key amenities
                </h2>
                <ul className="mt-4 grid gap-x-4 gap-y-3 text-sm text-[#545454]">
                  {fleet.amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 shrink-0 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.4}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      <span>{amenity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
          <motion.aside
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.12 }}
            className={`h-fit rounded-2xl border p-5 shadow-[0_4px_24px_rgba(3,61,74,0.06)] transition-colors duration-200 lg:sticky lg:top-[88px] ${selected ? "border-brand-teal/25 bg-brand-teal/5" : "border-zinc-200/70 bg-white"}`}
          >
            <p className="text-sm text-slate-500">
              {result.serviceType === "rental"
                ? "Daily rental price"
                : "Transfer package price"}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatPrice(result.price, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {result.serviceType === "rental"
                ? `${formatPrice(result.price * rentalDays, currency)} total for ${rentalDays} day${rentalDays === 1 ? "" : "s"}`
                : "Fixed total for this transfer"}
            </p>
            {result.serviceType === "rental" && (
              <p className="mt-2 text-sm text-emerald-700">
                {result.availability.availableQuantity} available
              </p>
            )}
            <div className="mt-5 border-t border-brand-teal/10 pt-5">
              <h2 className="text-sm font-bold text-charcoal">Your journey</h2>
              <dl className="mt-3 space-y-3">
                {journey.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium leading-5 text-slate-700">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <button
              type="button"
              onClick={() => setSelected(true)}
              aria-pressed={selected}
              className={`mt-5 min-h-11 w-full cursor-pointer rounded-xl px-5 text-sm font-bold transition-all duration-200 active:scale-[0.97] ${selected ? "bg-brand-teal text-white shadow-[0_8px_20px_rgba(3,61,74,0.28)]" : "border border-brand-teal/25 bg-white text-brand-teal hover:border-brand-teal hover:bg-brand-teal/5"}`}
            >
              {selected ? "Selected" : "Select"}
            </button>
          </motion.aside>
        </div>
      </main>
      <AnimatePresence>
        {reviewing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/35 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="Review selected car"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.3, ease }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">
                Selection summary
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                {fleet.displayName}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {result.serviceType === "rental"
                  ? "Rental dates preserved from your search"
                  : `${result.pickupLocation.label} → ${result.dropoffLocation.label}`}
              </p>
              <p className="mt-4 text-lg font-bold text-slate-900">
                {formatPrice(result.price, currency)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  display price
                </span>
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Final availability and pricing will be revalidated by the Cars
                checkout service.
              </p>
              <button
                type="button"
                onClick={() => router.push(checkoutHref)}
                className="mt-5 min-h-11 w-full rounded-xl bg-brand-teal px-5 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 transition hover:bg-[#012830] active:scale-[0.98]"
              >
                Continue to checkout
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  next.delete("step");
                  router.replace(`${pathname}?${next.toString()}`);
                }}
                className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
              >
                Back to car details
              </button>
            </motion.div>
          </motion.div>
        )}
        {selected && !reviewing && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-teal/10 bg-white/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 sm:flex">
                  <svg
                    className="h-5 w-5 text-brand-teal"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path d="M3.75 12h16.5M6 16.5h.008v.008H6V16.5zm12 0h.008v.008H18V16.5zM5.25 8.25l1.4-3.15A2.25 2.25 0 018.706 3.75h6.588a2.25 2.25 0 012.057 1.35l1.399 3.15M4.5 8.25h15A1.5 1.5 0 0121 9.75v7.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.25v-7.5a1.5 1.5 0 011.5-1.5z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-slate-500">
                    {fleet.displayName} ·{" "}
                    {result.serviceType === "rental" ? "Rental" : "Transfer"}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {formatPrice(result.price, currency)}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {result.serviceType === "rental"
                        ? `/ day · ${formatPrice(result.price * rentalDays, currency)} total`
                        : "total"}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  next.set("step", "review");
                  router.push(`${pathname}?${next.toString()}`);
                }}
                className="min-h-11 shrink-0 rounded-xl bg-brand-teal px-6 text-sm font-semibold text-white shadow-lg shadow-brand-teal/20 transition hover:-translate-y-0.5 hover:bg-[#012830] active:scale-[0.97]"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailItem({
  label,
  value,
  path,
}: {
  label: string;
  value: string;
  path: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/5">
        <svg
          className="h-[18px] w-[18px] text-brand-teal/70"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={path} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[#7d7d7d]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold capitalize text-charcoal">
          {value}
        </p>
      </div>
    </div>
  );
}

export function CarsContextualDetail({
  id,
  context,
}: {
  id: string;
  context: CarResultsContext;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16">
          <Skeleton variant="rect" className="h-80" />
        </div>
      }
    >
      <Detail id={id} context={context} />
    </Suspense>
  );
}
export default function CarDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16">
          <Skeleton variant="rect" className="h-80" />
        </div>
      }
    >
      <Detail id={use(params).id} />
    </Suspense>
  );
}
