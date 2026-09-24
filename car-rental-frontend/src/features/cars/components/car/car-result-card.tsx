"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CarFront,
  Check,
  MapPin,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type { Car } from "@/features/cars/types/car.types";
import { formatCurrency } from "@/lib/format";
import Image from "next/image";

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
    <Link
      href={`/cars/${car.id}`}
      aria-label={`View details for ${car.name}`}
      className="group block h-full rounded-card outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
    >
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -6 }}
        transition={{ duration: 0.26, delay: Math.min(index * 0.04, 0.2) }}
        className="flex h-full flex-col overflow-hidden rounded-card border border-white/80 bg-surface-elevated shadow-card transition-[border-color,box-shadow] duration-300 group-hover:border-white group-hover:shadow-elevated"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[#e6eaed]">
          {defaultImage && !imageFailed ? (
            <Image
              src={defaultImage.url}
              alt={`${car.name} rental car`}
              fill
              sizes="(min-width: 1280px) 28vw, (min-width: 768px) 42vw, 100vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted" role="img" aria-label="Car image unavailable">
              <div className="grid gap-3 text-center">
                <CarFront aria-hidden="true" className="mx-auto" size={34} strokeWidth={1.4} />
                <span className="text-xs font-medium">Image unavailable</span>
              </div>
            </div>
          )}
          {car.featured ? (
            <span className="absolute top-3 left-3 rounded-full border border-white/70 bg-white/85 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-foreground shadow-sm backdrop-blur-sm">
              Featured
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                {car.brand} · {car.year}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-foreground">
                {car.name}
              </h2>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-control border border-border bg-surface text-muted transition-colors group-hover:border-accent-secondary/30 group-hover:text-accent-secondary">
              <ArrowUpRight aria-hidden="true" size={17} />
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" size={15} />
              {car.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden="true" size={15} />
              {car.passengers} seats
            </span>
            <span className="capitalize">{car.transmission}</span>
            {car.serviceType === "transfer" && car.withDriver ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <Check aria-hidden="true" size={15} /> With Driver
              </span>
            ) : null}
          </div>

          {car.serviceType === "transfer" && hasExactRoute ? (
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground">
              <span>{lowestPackage.fromLocation}</span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0 text-muted"
                size={15}
              />
              <span>{lowestPackage.toLocation}</span>
            </p>
          ) : null}

          <div className="mt-6 flex items-end justify-between gap-4 border-t border-border/80 pt-5">
            <div>
              <p className="text-xs text-muted">
                {car.serviceType === "rental"
                  ? "Daily rate"
                  : hasExactRoute
                    ? "Route price"
                    : "Transfer price"}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">
                {car.serviceType === "rental" ? (
                  <>
                    {formatCurrency(car.dailyPrice, car.currency)}{" "}
                    <span className="text-sm font-medium text-muted">/ day</span>
                  </>
                ) : lowestPackage ? (
                  <>
                    {hasExactRoute ? "" : "From "}
                    {formatCurrency(lowestPackage.price, lowestPackage.currency)}
                  </>
                ) : (
                  <span className="text-sm text-muted">Price unavailable</span>
                )}
              </p>
            </div>
            <span className="text-sm font-semibold text-accent-secondary">
              View details
            </span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}

export function CarCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-card border border-white/70 bg-surface-elevated shadow-card"
    >
      <div className="aspect-[16/10] animate-pulse bg-black/[0.075]" />
      <div className="space-y-5 p-5">
        <div className="space-y-3">
          <div className="h-3 w-24 animate-pulse rounded-full bg-black/[0.08]" />
          <div className="h-6 w-3/4 animate-pulse rounded-full bg-black/[0.09]" />
        </div>
        <div className="flex gap-3">
          <div className="h-4 w-20 animate-pulse rounded-full bg-black/[0.07]" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-black/[0.07]" />
        </div>
        <div className="border-t border-border/70 pt-5">
          <div className="h-6 w-28 animate-pulse rounded-full bg-black/[0.09]" />
        </div>
      </div>
    </div>
  );
}
