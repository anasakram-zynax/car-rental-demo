"use client";

import { CheckCircle2, Clipboard, Copy, MapPin, RotateCcw, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { useCreateBooking } from "@/features/cars/hooks/use-create-booking";
import { useCar } from "@/features/cars/hooks/use-car";
import type { Car, CarBooking, CreateRentalBookingInput } from "@/features/cars/types/car.types";
import { calculateRentalEstimate } from "@/features/cars/utils/rental-price";
import { saveBookingReference } from "@/features/cars/utils/booking-references";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface BookingFormProps {
  carId: string;
}

type FormValues = Omit<CreateRentalBookingInput, "carId" | "specialRequests"> & {
  pickupAt: string;
  returnAt: string;
  driverBirthDate: string;
  specialRequests: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const emptyForm: FormValues = {
  pickupLocation: "",
  dropoffLocation: "",
  pickupAt: "",
  returnAt: "",
  driverFirstName: "",
  driverLastName: "",
  driverBirthDate: "",
  driverLicenseNumber: "",
  contactEmail: "",
  contactPhone: "",
  specialRequests: "",
};

function formatStatus(status: string) {
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const requiredFields: Array<[keyof FormValues, string]> = [
    ["pickupLocation", "Pickup location is required."],
    ["dropoffLocation", "Dropoff location is required."],
    ["pickupAt", "Pickup date and time are required."],
    ["returnAt", "Return date and time are required."],
    ["driverFirstName", "First name is required."],
    ["driverLastName", "Last name is required."],
    ["driverBirthDate", "Birth date is required."],
    ["driverLicenseNumber", "License number is required."],
    ["contactEmail", "Email is required."],
    ["contactPhone", "Phone number is required."],
  ];

  requiredFields.forEach(([field, message]) => {
    if (!values[field]?.trim()) errors[field] = message;
  });

  if (values.contactEmail && !/^\S+@\S+\.\S+$/.test(values.contactEmail)) {
    errors.contactEmail = "Enter a valid email address.";
  }

  const pickupTime = new Date(values.pickupAt).getTime();
  const returnTime = new Date(values.returnAt).getTime();
  if (values.pickupAt && !Number.isFinite(pickupTime)) {
    errors.pickupAt = "Enter a valid pickup date and time.";
  }
  if (values.returnAt && !Number.isFinite(returnTime)) {
    errors.returnAt = "Enter a valid return date and time.";
  }
  if (Number.isFinite(pickupTime) && Number.isFinite(returnTime) && returnTime <= pickupTime) {
    errors.returnAt = "Return must be after pickup.";
  }
  if (values.driverBirthDate && !Number.isFinite(new Date(values.driverBirthDate).getTime())) {
    errors.driverBirthDate = "Enter a valid birth date.";
  }

  return errors;
}

function CarFetchState({ carId }: { carId: string }) {
  const carQuery = useCar(carId);
  const retry = () => void carQuery.refetch();

  if (carQuery.isPending) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <div className="grid gap-7 lg:grid-cols-2">
          <div className="h-[34rem] animate-pulse rounded-card bg-black/[0.07]" />
          <div className="h-[46rem] animate-pulse rounded-card bg-black/[0.08]" />
        </div>
      </PageContainer>
    );
  }

  if (carQuery.isError || !carQuery.data) {
    const notFound = carQuery.error instanceof ApiError && carQuery.error.status === 404;
    return (
      <PageContainer className="py-16 sm:py-24">
        <Card variant="elevated" padding="lg" className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-semibold">{notFound ? "Car not found" : "Unable to load car"}</h1>
          <p className="mt-3 leading-7 text-muted">
            {notFound ? "This car is no longer part of the current collection." : "Please check your connection and try again."}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {!notFound ? <Button onClick={retry}>Try Again</Button> : null}
            <Link href="/cars" className={buttonStyles({ variant: "secondary" })}>Browse Cars</Link>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return <BookingScreen car={carQuery.data} />;
}

function BookingSuccessModal({ booking, carName, onClose }: { booking: CarBooking; carName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(booking.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-primary/45 p-4" role="presentation">
      <section aria-modal="true" aria-labelledby="booking-confirmed-title" role="dialog" className="max-h-[calc(100svh-2rem)] w-full max-w-xl overflow-y-auto rounded-card border border-white/80 bg-surface-elevated p-6 shadow-elevated sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div>
            <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 aria-hidden="true" size={24} /></span>
            <h2 id="booking-confirmed-title" className="mt-5 text-2xl font-semibold tracking-[-0.035em]">Booking Confirmed</h2>
          </div>
          <Button aria-label="Close confirmation" variant="ghost" size="sm" onClick={onClose}><X aria-hidden="true" size={18} /></Button>
        </div>
        <div className="mt-6 rounded-control border border-accent-secondary/20 bg-accent-secondary/[0.06] p-4">
          <p className="text-xs font-semibold tracking-[0.15em] text-muted uppercase">Booking reference</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <strong className="text-lg tracking-[0.04em]">{booking.reference}</strong>
            <Button variant="secondary" size="sm" onClick={() => void copyReference()}>
              {copied ? <CheckCircle2 aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
              {copied ? "Copied" : "Copy Reference"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">Keep this reference. You can use it to view your booking later.</p>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Car</dt><dd className="mt-1 font-semibold">{carName}</dd></div>
          <div><dt className="text-muted">Rental days</dt><dd className="mt-1 font-semibold">{booking.rentalDays}</dd></div>
          <div><dt className="text-muted">Pickup</dt><dd className="mt-1 font-semibold">{booking.pickupLocation}<br />{formatDateTime(booking.pickupAt)}</dd></div>
          <div><dt className="text-muted">Return</dt><dd className="mt-1 font-semibold">{booking.dropoffLocation}<br />{formatDateTime(booking.returnAt)}</dd></div>
          <div><dt className="text-muted">Booking status</dt><dd className="mt-1 font-semibold text-success">{formatStatus(booking.bookingStatus)}</dd></div>
          <div><dt className="text-muted">Payment status</dt><dd className="mt-1 font-semibold">{formatStatus(booking.paymentStatus)}</dd></div>
        </dl>
        <div className="mt-6 flex items-end justify-between border-t border-border pt-5"><span className="text-sm text-muted">Final price</span><strong className="text-2xl tracking-[-0.035em]">{formatCurrency(booking.totalPrice, booking.currency)}</strong></div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/cars" className={buttonStyles({ className: "flex-1", variant: "secondary" })}>Browse Cars</Link>
          <Link href="/my-bookings" className={buttonStyles({ className: "flex-1" })}>My Booking</Link>
        </div>
      </section>
    </div>
  );
}

function BookingScreen({ car }: { car: Car }) {
  const createBooking = useCreateBooking();
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [booking, setBooking] = useState<CarBooking | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const defaultImage = car.images.find((image) => image.isDefault) ?? car.images[0];
  const estimate = useMemo(() => calculateRentalEstimate(values.pickupAt, values.returnAt, car.dailyPrice), [car.dailyPrice, values.pickupAt, values.returnAt]);

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmissionError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createBooking.isPending) return;
    const nextErrors = validateForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input: CreateRentalBookingInput = {
      carId: car.id,
      pickupLocation: values.pickupLocation.trim(),
      dropoffLocation: values.dropoffLocation.trim(),
      pickupAt: new Date(values.pickupAt).toISOString(),
      returnAt: new Date(values.returnAt).toISOString(),
      driverFirstName: values.driverFirstName.trim(),
      driverLastName: values.driverLastName.trim(),
      driverBirthDate: new Date(values.driverBirthDate).toISOString(),
      driverLicenseNumber: values.driverLicenseNumber.trim(),
      contactEmail: values.contactEmail.trim(),
      contactPhone: values.contactPhone.trim(),
      ...(values.specialRequests.trim() ? { specialRequests: values.specialRequests.trim() } : {}),
    };

    try {
      const createdBooking = await createBooking.mutateAsync(input);
      saveBookingReference(createdBooking.reference);
      setBooking(createdBooking);
    } catch (error) {
      setSubmissionError(error instanceof ApiError ? error.message : "Unable to create the booking. Please try again.");
    }
  }

  const textareaClassName = cn(
    "min-h-28 w-full rounded-control border border-border bg-surface-elevated px-3.5 py-3 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-65",
    errors.specialRequests && "border-danger focus:border-danger focus:ring-red-900/15",
  );

  return (
    <PageContainer className="py-10 sm:py-14 lg:py-16">
      <Link href={`/cars/${car.id}`} className={buttonStyles({ className: "-ml-3", size: "sm", variant: "ghost" })}>← Back to car</Link>
      <div className="mt-7 max-w-3xl"><p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">Reserve your car</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Plan the journey.</h1><p className="mt-4 leading-7 text-muted">Enter your details below. Availability and final pricing are confirmed by the server.</p></div>
      <div className="mt-10 grid items-start gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:gap-10">
        <aside className="space-y-6 lg:sticky lg:top-6">
          <Card padding="none" className="overflow-hidden">
            <div className="relative aspect-[16/10] bg-black/[0.05]">
              {defaultImage && !imageFailed ? <Image src={defaultImage.url} alt={`${car.name} rental car`} fill sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover" onError={() => setImageFailed(true)} /> : <span className="grid h-full place-items-center text-sm text-muted"><Clipboard aria-hidden="true" size={22} /></span>}
            </div>
            <div className="p-5"><p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">Selected car</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{car.name}</h2><p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin aria-hidden="true" size={15} />{car.brand} · {car.year} · {car.city}</p><p className="mt-5 text-lg font-semibold">{formatCurrency(car.dailyPrice, car.currency)} <span className="text-sm font-normal text-muted">per day</span></p></div>
          </Card>
          <Card padding="lg"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold tracking-[-0.03em]">Estimated pricing</h2><span className="rounded-full bg-accent-secondary/10 px-2.5 py-1 text-xs font-semibold text-accent-secondary">Estimated</span></div>{estimate ? <><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted">Estimated rental days</dt><dd className="font-semibold">{estimate.rentalDays}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Estimated subtotal</dt><dd className="font-semibold">{formatCurrency(estimate.subtotal, car.currency)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Estimated tax (10%)</dt><dd className="font-semibold">{formatCurrency(estimate.taxAmount, car.currency)}</dd></div><div className="flex justify-between gap-4 border-t border-border pt-4 text-base"><dt className="font-semibold">Estimated total</dt><dd className="font-semibold">{formatCurrency(estimate.total, car.currency)}</dd></div></dl><p className="mt-5 text-xs leading-5 text-muted">Final pricing is confirmed by the server when the booking is created.</p></> : <p className="mt-5 text-sm leading-6 text-muted">Choose valid pickup and return dates to see an estimated rental total.</p>}</Card>
        </aside>
        <Card variant="elevated" padding="lg">
          <h2 className="text-2xl font-semibold tracking-[-0.035em]">Booking details</h2><p className="mt-2 text-sm leading-6 text-muted">All required fields are marked by their labels.</p>
          <form className="mt-7 space-y-7" noValidate onSubmit={handleSubmit}>
            <fieldset disabled={createBooking.isPending} className="grid gap-5"><legend className="mb-4 text-sm font-semibold">Rental details</legend><Input label="Pickup location" required value={values.pickupLocation} error={errors.pickupLocation} onChange={(event) => updateValue("pickupLocation", event.target.value)} /><Input label="Dropoff location" required value={values.dropoffLocation} error={errors.dropoffLocation} onChange={(event) => updateValue("dropoffLocation", event.target.value)} /><div className="grid gap-5 sm:grid-cols-2"><Input label="Pickup date and time" required type="datetime-local" value={values.pickupAt} error={errors.pickupAt} onChange={(event) => updateValue("pickupAt", event.target.value)} /><Input label="Return date and time" required type="datetime-local" value={values.returnAt} error={errors.returnAt} onChange={(event) => updateValue("returnAt", event.target.value)} /></div></fieldset>
            <fieldset disabled={createBooking.isPending} className="grid gap-5 border-t border-border pt-7"><legend className="mb-4 text-sm font-semibold">Driver information</legend><div className="grid gap-5 sm:grid-cols-2"><Input label="First name" required value={values.driverFirstName} error={errors.driverFirstName} onChange={(event) => updateValue("driverFirstName", event.target.value)} /><Input label="Last name" required value={values.driverLastName} error={errors.driverLastName} onChange={(event) => updateValue("driverLastName", event.target.value)} /></div><Input label="Birth date" required type="date" value={values.driverBirthDate} error={errors.driverBirthDate} onChange={(event) => updateValue("driverBirthDate", event.target.value)} /><Input label="Driver license number" required value={values.driverLicenseNumber} error={errors.driverLicenseNumber} onChange={(event) => updateValue("driverLicenseNumber", event.target.value)} /></fieldset>
            <fieldset disabled={createBooking.isPending} className="grid gap-5 border-t border-border pt-7"><legend className="mb-4 text-sm font-semibold">Contact information</legend><div className="grid gap-5 sm:grid-cols-2"><Input label="Email" required type="email" value={values.contactEmail} error={errors.contactEmail} onChange={(event) => updateValue("contactEmail", event.target.value)} /><Input label="Phone" required type="tel" value={values.contactPhone} error={errors.contactPhone} onChange={(event) => updateValue("contactPhone", event.target.value)} /></div><div className="grid gap-2"><label className="text-sm font-medium" htmlFor="special-requests">Special requests <span className="text-muted">(optional)</span></label><textarea id="special-requests" className={textareaClassName} value={values.specialRequests} onChange={(event) => updateValue("specialRequests", event.target.value)} /></div></fieldset>
            {submissionError ? <p aria-live="polite" className="rounded-control border border-danger/20 bg-red-900/[0.06] px-4 py-3 text-sm leading-6 text-danger">{submissionError}</p> : null}
            <Button className="w-full" size="lg" type="submit" disabled={createBooking.isPending}>{createBooking.isPending ? <><RotateCcw aria-hidden="true" className="animate-spin" size={17} />Creating booking...</> : "Confirm Booking"}</Button>
          </form>
        </Card>
      </div>
      {booking ? <BookingSuccessModal booking={booking} carName={car.name} onClose={() => setBooking(null)} /> : null}
    </PageContainer>
  );
}

export function BookingForm({ carId }: BookingFormProps) {
  return <CarFetchState carId={carId} />;
}
