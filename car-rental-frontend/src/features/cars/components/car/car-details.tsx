"use client";

import {
  ArrowLeft,
  BaggageClaim,
  Check,
  CircleDollarSign,
  DoorOpen,
  Fuel,
  MapPin,
  ShieldCheck,
  Sparkles,
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

function formatServiceType(serviceType: Car["serviceType"]) {
  return serviceType === "transfer" ? "Transfer" : "Rental";
}

function BookingCard({ car }: { car: Car }) {
  const isTransfer = car.serviceType === "transfer";

  return (
    <Card variant="elevated" padding="none" className="overflow-hidden lg:sticky lg:top-6">
      <div className="border-b border-border bg-[#f7f9fc] px-6 py-5 sm:px-7">
        <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
          Ready to book
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
          {isTransfer ? "Choose your route" : "Reserve this car"}
        </h2>
      </div>
      <div className="p-6 sm:p-7">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
        {isTransfer ? "Transfer packages" : "Rental price"}
      </p>
      {isTransfer ? (
        <ul className="mt-5 space-y-3">
          {car.transferPackages.map((item) => (
            <li key={item.id} className="rounded-control border border-border bg-white px-4 py-3.5 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold leading-5">{item.fromLocation} <span className="text-accent">→</span> {item.toLocation}</p>
                <Waypoints aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={17} />
              </div>
              <p className="mt-2 text-base font-semibold text-foreground">{formatCurrency(item.price, item.currency)} <span className="text-xs font-medium text-muted">{item.currency}</span></p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex items-end gap-2">
          <span className="text-4xl font-semibold tracking-[-0.055em] text-foreground">
            {formatCurrency(car.dailyPrice, car.currency)}
          </span>
          <span className="mb-1 text-sm text-muted">/ day</span>
        </div>
      )}
      {isTransfer && car.withDriver ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-success">
          <ShieldCheck aria-hidden="true" size={17} />
          With Driver
        </p>
      ) : !isTransfer && car.isRefundable ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-success">
          <ShieldCheck aria-hidden="true" size={17} />
          Refundable booking
        </p>
      ) : !isTransfer ? (
        <p className="mt-5 text-sm font-medium text-muted">Non-refundable booking</p>
      ) : null}
      <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted">
        {isTransfer
          ? "Select a route package and pickup time on the next step."
          : "Select your rental dates on the next step to check availability and calculate the final price."}
      </p>
      <Link href={`/cars/${car.id}/book`} className={buttonStyles({ className: "mt-6 w-full", size: "lg" })}>
        Book This Car
      </Link>
      <div className="mt-5 grid gap-2.5 border-t border-border pt-5 text-xs leading-5 text-muted">
        <p className="flex gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={15} /> Availability is checked when you book.</p>
        <p className="flex gap-2"><CircleDollarSign aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={15} /> {isTransfer ? "Routes use their listed fixed price." : "Your date-based estimate is shown before confirmation."}</p>
      </div>
      </div>
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
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <Link href="/cars" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
        <ArrowLeft aria-hidden="true" size={17} />
        Back to Cars
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:gap-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-blue-200 bg-blue-50 text-accent">{formatServiceType(car.serviceType)}</Badge>
            {car.withDriver ? <Badge variant="success">With Driver</Badge> : null}
            {car.featured ? <Badge variant="accent"><Sparkles aria-hidden="true" size={12} /> Featured</Badge> : null}
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
            <h1 className="text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              {car.name}
            </h1>
            <p className="mt-3 text-base text-muted sm:text-lg">
              {car.brand} {car.model} <span aria-hidden="true">•</span> {car.year}
            </p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-2 text-sm font-medium text-muted shadow-sm">
              <MapPin aria-hidden="true" className="text-accent" size={16} /> {car.city}
            </p>
          </div>

          <div className="mt-7">
            <CarImageGallery carName={car.name} images={car.images} />
          </div>

          <Card className="mt-7" padding="lg" variant="elevated">
            <div>
              <p className="text-xs font-semibold tracking-[0.15em] text-accent uppercase">At a glance</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Vehicle details</h2>
            </div>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {specifications(car).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 rounded-control border border-border/80 bg-[#f8fafe] px-3.5 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-blue-50 text-accent">
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
            <Card className="mt-6" padding="lg" variant="elevated">
              <p className="text-xs font-semibold tracking-[0.15em] text-accent uppercase">Included features</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Amenities</h2>
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
