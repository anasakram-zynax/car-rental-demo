"use client";

import {
  ArrowLeft,
  BaggageClaim,
  Check,
  DoorOpen,
  Fuel,
  MapPin,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { useCar } from "@/features/cars/hooks/use-car";
import type { Car } from "@/features/cars/types/car.types";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { CarImageGallery } from "./car-image-gallery";

interface CarDetailsProps {
  carId: string;
}

function DetailsSkeleton() {
  return (
    <PageContainer className="py-10 sm:py-14 lg:py-16">
      <div className="h-4 w-28 animate-pulse rounded-full bg-black/[0.08]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          <div className="h-11 w-3/4 animate-pulse rounded-full bg-black/[0.09]" />
          <div className="h-5 w-1/2 animate-pulse rounded-full bg-black/[0.07]" />
          <div className="aspect-[16/10] animate-pulse rounded-card bg-black/[0.08]" />
          <div className="h-52 animate-pulse rounded-card bg-black/[0.06]" />
        </div>
        <div className="h-72 animate-pulse rounded-card bg-black/[0.08]" />
      </div>
    </PageContainer>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <PageContainer className="py-16 sm:py-24">
      <Card variant="elevated" padding="lg" className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.035em]">
          {notFound ? "Car not found" : "Unable to load car"}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {notFound
            ? "This car may no longer be part of the current collection."
            : "Please check your connection and try again."}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {!notFound ? <Button onClick={onRetry}>Try Again</Button> : null}
          <Link href="/cars" className={buttonStyles({ variant: "secondary" })}>
            Browse Cars
          </Link>
        </div>
      </Card>
    </PageContainer>
  );
}

const specifications = (car: Car) => [
  { label: "Passengers", value: car.passengers, icon: Users },
  { label: "Transmission", value: car.transmission, icon: Waypoints },
  { label: "Fuel type", value: car.fuelType, icon: Fuel },
  { label: "Doors", value: car.doors, icon: DoorOpen },
  { label: "Baggage", value: car.baggage, icon: BaggageClaim },
  { label: "Location", value: car.city, icon: MapPin },
];

function BookingCard({ car }: { car: Car }) {
  return (
    <Card variant="elevated" padding="lg" className="lg:sticky lg:top-6">
      <p className="text-sm font-semibold tracking-[0.16em] text-muted uppercase">
        Rental price
      </p>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-semibold tracking-[-0.055em] text-foreground">
          {formatCurrency(car.dailyPrice, car.currency)}
        </span>
        <span className="mb-1 text-sm text-muted">per day</span>
      </div>
      {car.isRefundable ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-success">
          <ShieldCheck aria-hidden="true" size={17} />
          Refundable booking
        </p>
      ) : (
        <p className="mt-5 text-sm font-medium text-muted">Non-refundable booking</p>
      )}
      <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted">
        Select your rental dates on the next step to check availability and calculate the final price.
      </p>
      <Link href={`/cars/${car.id}/book`} className={buttonStyles({ className: "mt-6 w-full", size: "lg" })}>
        Book This Car
      </Link>
    </Card>
  );
}

export function CarDetails({ carId }: CarDetailsProps) {
  const carQuery = useCar(carId);
  const retry = () => void carQuery.refetch();

  if (carQuery.isPending) return <DetailsSkeleton />;
  if (carQuery.isError) return <QueryError error={carQuery.error} onRetry={retry} />;
  if (!carQuery.data) return <QueryError error={new ApiError("Car not found", 404)} onRetry={retry} />;

  const car = carQuery.data;

  return (
    <PageContainer className="py-10 sm:py-14 lg:py-16">
      <Link href="/cars" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
        <ArrowLeft aria-hidden="true" size={17} />
        Back to Cars
      </Link>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:gap-10">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              {car.name}
            </h1>
            {car.featured ? <Badge variant="accent">Featured</Badge> : null}
          </div>
          <p className="mt-3 text-base text-muted sm:text-lg">
            {car.brand} <span aria-hidden="true">•</span> {car.year} <span aria-hidden="true">•</span> {car.city}
          </p>

          <div className="mt-8">
            <CarImageGallery carName={car.name} images={car.images} />
          </div>

          <Card className="mt-8" padding="lg">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Vehicle details</h2>
            <dl className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              {specifications(car).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-secondary/10 text-accent-secondary">
                    <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <dt className="text-xs font-medium text-muted">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          {car.amenities.length > 0 ? (
            <Card className="mt-6" padding="lg">
              <h2 className="text-xl font-semibold tracking-[-0.03em]">Amenities</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {car.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2.5 text-sm text-muted">
                    <Check aria-hidden="true" className="shrink-0 text-success" size={17} strokeWidth={2.3} />
                    {amenity}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <BookingCard car={car} />
      </div>
    </PageContainer>
  );
}
