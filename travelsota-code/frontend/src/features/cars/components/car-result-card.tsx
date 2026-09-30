"use client";
import Image from "next/image";
import Link from "next/link";
import { useCurrencyDisplay } from "@/context/CurrencyContext";
import type { CarSearchResult } from "../types";

export function CarResultCard({
  result,
  detailsHref,
}: {
  result: CarSearchResult;
  detailsHref: string;
}) {
  const { formatPrice } = useCurrencyDisplay();
  const fleet = result.serviceType === "rental" ? result : result.fleet;
  const currency =
    result.serviceType === "rental" ? fleet.currency : result.currency;
  const image = [...(fleet.images ?? [])].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order,
  )[0]?.url;
  return (
    <article className="search-result-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md sm:flex">
      <div className="relative aspect-[16/10] bg-slate-100 sm:aspect-auto sm:w-72 sm:shrink-0">
        {image ? (
          <Image
            src={image}
            alt={fleet.displayName}
            fill
            sizes="(max-width: 640px) 100vw, 288px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center text-sm font-medium text-slate-400">
            Image unavailable
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex rounded-full bg-brand-teal/5 px-2.5 py-1 text-xs font-semibold capitalize text-brand-teal">
              {fleet.category}
            </span>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              {fleet.displayName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {fleet.location.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-900">
              {formatPrice(result.price, currency)}
            </p>
            <p className="text-xs text-slate-500">
              {result.serviceType === "rental" ? "per day" : "per transfer"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <Feature
            label={`${fleet.passengerCapacity} passengers`}
            path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z"
          />
          {fleet.luggageCapacity != null && (
            <Feature
              label={`${fleet.luggageCapacity} bags`}
              path="M6.75 7.5h10.5a2.25 2.25 0 012.25 2.25v8.25a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V9.75A2.25 2.25 0 016.75 7.5zm2.25 0V5.25A2.25 2.25 0 0111.25 3h1.5A2.25 2.25 0 0115 5.25V7.5"
            />
          )}
          {fleet.transmission && (
            <Feature
              label={fleet.transmission}
              path="M12 3v18m-4.5-6H6a3 3 0 010-6h1.5m9 0H18a3 3 0 010 6h-1.5"
            />
          )}
        </div>
        {result.serviceType === "transfer" && (
          <p className="mt-4 text-sm font-medium text-slate-600">
            {result.pickupLocation.label} <span aria-hidden>→</span>{" "}
            {result.dropoffLocation.label}
          </p>
        )}
        {result.serviceType === "rental" && (
          <p className="mt-4 text-sm font-medium text-emerald-700">
            {result.availability.availableQuantity} available for these dates
          </p>
        )}
        <div className="mt-auto pt-5 text-right">
          <Link
            href={detailsHref}
            className="inline-flex min-h-11 items-center rounded-xl border border-brand-teal/20 px-5 text-sm font-semibold text-brand-teal transition hover:bg-brand-teal/5"
          >
            View car
          </Link>
        </div>
      </div>
    </article>
  );
}
function Feature({ label, path }: { label: string; path: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 capitalize">
      <svg
        className="h-4 w-4 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
      {label}
    </span>
  );
}
