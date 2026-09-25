"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarSearch, Search } from "lucide-react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageContainer } from "@/components/ui/page-container";
import { useBooking } from "@/features/cars/hooks/use-booking";
import { useCarBookings } from "@/features/cars/hooks/use-car-bookings";
import { ApiError } from "@/lib/api-client";
import {
  readBookingReferences,
  removeBookingReference,
  saveBookingReference,
} from "@/features/cars/utils/booking-references";
import { BookingCard } from "./booking-card";

function BookingCardSkeleton() {
  return (
    <div className="h-80 animate-pulse rounded-card border border-white/70 bg-surface-elevated shadow-card" />
  );
}

function LookupError({ error }: { error: unknown }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <p aria-live="polite" className="mt-3 text-sm text-danger">
      {notFound
        ? "Booking not found. Check the reference and try again."
        : "Unable to find that booking right now. Please try again."}
    </p>
  );
}

export function MyBookings() {
  const [references, setReferences] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [referenceInput, setReferenceInput] = useState("");
  const [lookupReference, setLookupReference] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const savedQueries = useCarBookings(references);
  const lookupQuery = useBooking(lookupReference);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReferences(readBookingReferences());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    savedQueries.forEach((query, index) => {
      if (query.error instanceof ApiError && query.error.status === 404) {
        const reference = references[index];
        if (reference) {
          removeBookingReference(reference);
          setReferences((current) =>
            current.filter((item) => item !== reference),
          );
        }
      }
    });
  }, [references, savedQueries]);

  useEffect(() => {
    if (!lookupQuery.data) return;
    const timer = window.setTimeout(() => {
      saveBookingReference(lookupQuery.data.reference);
      setReferences((current) =>
        current.includes(lookupQuery.data.reference)
          ? current
          : [...current, lookupQuery.data.reference],
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lookupQuery.data]);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = referenceInput.trim().toUpperCase();
    if (!normalized) {
      setLookupError("Enter a booking reference.");
      return;
    }
    setLookupError(null);
    if (normalized === lookupReference) void lookupQuery.refetch();
    else setLookupReference(normalized);
  }

  const isLoadingSaved =
    !ready || savedQueries.some((query) => query.isPending);
  const resolvedBookings = savedQueries.flatMap((query) =>
    query.data ? [query.data] : [],
  );
  const hasNetworkError = savedQueries.some(
    (query) =>
      query.isError &&
      !(query.error instanceof ApiError && query.error.status === 404),
  );

  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
          Your trips
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          My Bookings
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">
          Review bookings saved in this browser, check trip and payment details,
          or retrieve another booking using its reference.
        </p>
      </div>
      <Card
        variant="elevated"
        padding="none"
        className="mt-8 max-w-4xl overflow-hidden"
      >
        <div className="border-b border-border bg-[#f7f9fc] px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-blue-50 text-accent">
              <CalendarSearch aria-hidden="true" size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">Find a booking</h2>
                <InfoTooltip label="Enter the booking reference from your confirmation to save and display that booking in this browser." />
              </div>
              <p className="mt-0.5 text-sm text-muted">
                Use the reference from your booking confirmation.
              </p>
            </div>
          </div>
        </div>
        <form
          className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:p-7"
          onSubmit={submitLookup}
          noValidate
        >
          <Input
            label="Booking reference"
            className="h-12 uppercase"
            rootClassName="min-w-0 flex-1"
            placeholder="CR-XXXXXXXXXX"
            value={referenceInput}
            onChange={(event) => {
              setReferenceInput(event.target.value);
              setLookupError(null);
            }}
            error={lookupError ?? undefined}
          />
          <Button
            className="h-12 sm:mt-7"
            type="submit"
            disabled={lookupQuery.isFetching}
          >
            <Search aria-hidden="true" size={17} />
            {lookupQuery.isFetching ? "Finding..." : "Find Booking"}
          </Button>
        </form>
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          {lookupQuery.isError ? (
            <LookupError error={lookupQuery.error} />
          ) : null}
          {lookupQuery.isFetching ? (
            <p className="text-sm text-muted">Looking up booking…</p>
          ) : null}
        </div>
      </Card>
      <section aria-labelledby="saved-bookings" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-accent uppercase">
              Booking history
            </p>
            <h2
              id="saved-bookings"
              className="mt-2 text-2xl font-semibold tracking-[-0.035em]"
            >
              Saved Bookings
            </h2>
          </div>
          {!isLoadingSaved && resolvedBookings.length > 0 ? (
            <p className="text-sm text-muted">
              {resolvedBookings.length} saved{" "}
              {resolvedBookings.length === 1 ? "booking" : "bookings"}
            </p>
          ) : null}
        </div>
        {isLoadingSaved ? (
          <div className="mt-5 grid gap-5">
            <BookingCardSkeleton />
          </div>
        ) : null}
        {!isLoadingSaved && resolvedBookings.length > 0 ? (
          <div className="mt-5 grid gap-5">
            {resolvedBookings.map((booking) => (
              <BookingCard key={booking.reference} booking={booking} />
            ))}
          </div>
        ) : null}
        {!isLoadingSaved && resolvedBookings.length === 0 ? (
          <Card
            padding="lg"
            className="mt-5 max-w-3xl border-dashed text-center"
          >
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-accent">
              <CalendarSearch aria-hidden="true" size={22} />
            </span>
            <h3 className="mt-4 text-lg font-semibold">
              No bookings are remembered in this browser yet.
            </h3>
            <p className="mx-auto mt-2 max-w-lg leading-7 text-muted">
              Enter a booking reference above to retrieve an existing booking,
              or browse the current fleet to plan a new trip.
            </p>
            <Link
              href="/cars"
              className={buttonStyles({
                className: "mt-6",
                variant: "secondary",
              })}
            >
              Browse Cars
            </Link>
          </Card>
        ) : null}
        {hasNetworkError ? (
          <p className="mt-4 text-sm text-danger">
            Some remembered bookings could not be loaded. Please try refreshing
            the page.
          </p>
        ) : null}
      </section>
    </PageContainer>
  );
}
