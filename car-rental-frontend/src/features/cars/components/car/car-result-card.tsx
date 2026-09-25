"use client";

import {
  ArrowRight,
  Briefcase,
  CarFront,
  Check,
  Fuel,
  MapPin,
  Settings2,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Car } from "@/features/cars/types/car.types";
import { formatCurrency } from "@/lib/format";

interface CarCardProps {
  car: Car;
  index?: number;
  pickupLocation?: string;
  dropoffLocation?: string;
}

export function CarCard({
  car,
  dropoffLocation,
  index = 0,
  pickupLocation,
}: CarCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const defaultImage =
    car.images.find((image) => image.isDefault) ?? car.images[0];
  const lowestPackage = car.transferPackages.reduce(
    (lowest, current) =>
      !lowest || current.price < lowest.price ? current : lowest,
    car.transferPackages[0],
  );
  const hasExactRoute = Boolean(
    pickupLocation && dropoffLocation && lowestPackage,
  );

  return (
    <div
      aria-label={`View details for ${car.name}`}
      className="group block rounded-card outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
    >
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.15) }}
        className="grid overflow-hidden rounded-card border border-border bg-white shadow-card transition-[border-color,box-shadow] duration-200 group-hover:border-[#b9cbe1] group-hover:shadow-elevated md:grid-cols-[14rem_minmax(0,1fr)_10.5rem] xl:grid-cols-[15.5rem_minmax(0,1fr)_11rem]"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[#e8edf3] md:aspect-auto md:min-h-[15rem]">
          {defaultImage && !imageFailed ? (
            <Image
              src={defaultImage.url}
              alt={`${car.name} rental car`}
              fill
              sizes="(min-width: 1280px) 250px, (min-width: 768px) 224px, 100vw"
              className="object-contain object-center p-4"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div
              className="grid h-full place-items-center text-muted"
              role="img"
              aria-label="Car image unavailable"
            >
              <div className="grid gap-2 text-center">
                <CarFront
                  aria-hidden="true"
                  className="mx-auto"
                  size={34}
                  strokeWidth={1.4}
                />
                <span className="text-xs font-medium">Image unavailable</span>
              </div>
            </div>
          )}
          <span className="absolute top-3 left-3 rounded-full bg-[#10203d]/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
            {car.serviceType === "rental" ? "Rental" : "Transfer"}
          </span>
          {car.featured ? (
            <span className="absolute top-3 right-3 rounded-full border border-white/80 bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-[#10203d] shadow-sm">
              Featured
            </span>
          ) : null}
        </div>

        <div className="min-w-0 p-5 sm:p-6 md:p-5 xl:p-6">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
            {car.brand} · {car.year}
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-foreground">
            {car.name}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-muted">
            <span className="inline-flex min-w-0 items-center gap-2 capitalize">
              <Settings2
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={16}
              />
              <span className="truncate">{car.transmission}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-2 capitalize">
              <Fuel
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={16}
              />
              <span className="truncate">{car.fuelType}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Users
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={16}
              />
              {car.passengers} seats
            </span>
            <span className="inline-flex items-center gap-2">
              <Briefcase
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={16}
              />
              {car.baggage} bags
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
              <MapPin aria-hidden="true" className="shrink-0" size={15} />
              <span className="truncate">{car.city}</span>
            </span>
            {car.serviceType === "transfer" && car.withDriver ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-success">
                <Check aria-hidden="true" size={14} /> With driver
              </span>
            ) : null}
          </div>

          {car.serviceType === "transfer" && lowestPackage ? (
            <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border border-[#d9e5f2] bg-[#f6f9fd] px-3 py-2.5 text-sm font-medium text-foreground">
              <span className="truncate">{lowestPackage.fromLocation}</span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={15}
              />
              <span className="truncate">{lowestPackage.toLocation}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-5 border-t border-border bg-[#fbfcfe] p-5 md:border-t-0 md:border-l md:p-4 xl:p-5">
          <div>
            <p className="text-xs font-medium text-muted">
              {car.serviceType === "rental"
                ? "From"
                : hasExactRoute
                  ? "Route price"
                  : "From"}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-xl xl:text-2xl">
              {car.serviceType === "rental" ? (
                formatCurrency(car.dailyPrice, car.currency)
              ) : lowestPackage ? (
                formatCurrency(lowestPackage.price, lowestPackage.currency)
              ) : (
                <span className="text-sm text-muted">Unavailable</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              {car.serviceType === "rental" ? "/ day" : "fixed route"}
            </p>
          </div>
          <Link
            href={`/cars/${car.id}`}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control bg-primary px-3 text-sm font-semibold text-white shadow-sm transition-[filter,transform] group-hover:-translate-y-px group-hover:brightness-95"
          >
            View car <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </motion.article>
    </div>
  );
}

export function CarCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid overflow-hidden rounded-card border border-border bg-white shadow-card md:grid-cols-[14rem_minmax(0,1fr)_10.5rem] xl:grid-cols-[15.5rem_minmax(0,1fr)_11rem]"
    >
      <div className="aspect-[16/10] animate-pulse bg-black/[0.075] md:aspect-auto md:min-h-[15rem]" />
      <div className="space-y-5 p-5">
        <div className="space-y-3">
          <div className="h-3 w-24 animate-pulse rounded-full bg-black/[0.08]" />
          <div className="h-6 w-2/3 animate-pulse rounded-full bg-black/[0.09]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-4 w-20 animate-pulse rounded-full bg-black/[0.07]"
            />
          ))}
        </div>
      </div>
      <div className="space-y-4 border-t border-border bg-[#fbfcfe] p-5 md:border-t-0 md:border-l">
        <div className="h-3 w-12 animate-pulse rounded-full bg-black/[0.07]" />
        <div className="h-7 w-24 animate-pulse rounded-full bg-black/[0.09]" />
        <div className="h-10 w-full animate-pulse rounded-control bg-black/[0.08]" />
      </div>
    </div>
  );
}
