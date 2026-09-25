"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clipboard,
  Copy,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Waypoints,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { useCreateBooking } from "@/features/cars/hooks/use-create-booking";
import { useCar } from "@/features/cars/hooks/use-car";
import type {
  Car,
  CarBooking,
  CreateRentalBookingInput,
  CreateTransferBookingInput,
} from "@/features/cars/types/car.types";
import { calculateRentalEstimate } from "@/features/cars/utils/rental-price";
import { saveBookingReference } from "@/features/cars/utils/booking-references";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface BookingFormProps {
  carId: string;
}

interface FormValues {
  transferPackageId: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupAt: string;
  returnAt: string;
  driverFirstName: string;
  driverLastName: string;
  driverBirthDate: string;
  driverLicenseNumber: string;
  contactEmail: string;
  contactPhone: string;
  specialRequests: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

const emptyForm: FormValues = {
  transferPackageId: "",
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

function validateForm(values: FormValues, car: Car): FormErrors {
  const errors: FormErrors = {};
  const requiredFields: Array<[keyof FormValues, string]> = [
    ["pickupAt", "Pickup date and time are required."],
    ["driverFirstName", "First name is required."],
    ["driverLastName", "Last name is required."],
    ["contactEmail", "Email is required."],
    ["contactPhone", "Phone number is required."],
  ];

  if (car.serviceType === "rental") {
    requiredFields.push(
      ["pickupLocation", "Pickup location is required."],
      ["dropoffLocation", "Dropoff location is required."],
      ["returnAt", "Return date and time are required."],
      ["driverBirthDate", "Birth date is required."],
      ["driverLicenseNumber", "License number is required."],
    );
  } else if (
    !car.transferPackages.some((item) => item.id === values.transferPackageId)
  ) {
    errors.transferPackageId = "Select a valid transfer package.";
  }

  requiredFields.forEach(([field, message]) => {
    if (!values[field]?.trim()) errors[field] = message;
  });

  if (values.contactEmail && !/^\S+@\S+\.\S+$/.test(values.contactEmail)) {
    errors.contactEmail = "Enter a valid email address.";
  }

  const pickupTime = new Date(values.pickupAt).getTime();
  if (values.pickupAt && !Number.isFinite(pickupTime)) {
    errors.pickupAt = "Enter a valid pickup date and time.";
  }
  if (car.serviceType === "rental") {
    const returnTime = new Date(values.returnAt).getTime();
    if (values.returnAt && !Number.isFinite(returnTime)) {
      errors.returnAt = "Enter a valid return date and time.";
    }
    if (
      Number.isFinite(pickupTime) &&
      Number.isFinite(returnTime) &&
      returnTime <= pickupTime
    ) {
      errors.returnAt = "Return must be after pickup.";
    }
    if (
      values.driverBirthDate &&
      !Number.isFinite(new Date(values.driverBirthDate).getTime())
    ) {
      errors.driverBirthDate = "Enter a valid birth date.";
    }
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
    const notFound =
      carQuery.error instanceof ApiError && carQuery.error.status === 404;
    return (
      <PageContainer className="py-16 sm:py-24">
        <Card
          variant="elevated"
          padding="lg"
          className="mx-auto max-w-xl text-center"
        >
          <h1 className="text-2xl font-semibold">
            {notFound ? "Car not found" : "Unable to load car"}
          </h1>
          <p className="mt-3 leading-7 text-muted">
            {notFound
              ? "This car is no longer part of the current collection."
              : "Please check your connection and try again."}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {!notFound ? <Button onClick={retry}>Try Again</Button> : null}
            <Link
              href="/cars"
              className={buttonStyles({ variant: "secondary" })}
            >
              Browse Cars
            </Link>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return <BookingScreen car={carQuery.data} />;
}

function BookingSuccessModal({
  booking,
  carName,
  isTransfer,
  onClose,
}: {
  booking: CarBooking;
  carName: string;
  isTransfer: boolean;
  onClose: () => void;
}) {
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-primary/10 p-4"
      role="presentation"
    >
      <section
        aria-modal="true"
        aria-labelledby="booking-confirmed-title"
        role="dialog"
        className="max-h-[calc(100svh-2rem)] w-full max-w-xl overflow-y-auto rounded-card border border-white/80 bg-surface-elevated p-6 shadow-elevated sm:p-8"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success">
              <CheckCircle2 aria-hidden="true" size={24} />
            </span>
            <h2
              id="booking-confirmed-title"
              className="mt-5 text-2xl font-semibold tracking-[-0.035em]"
            >
              Booking Confirmed
            </h2>
          </div>
          <Button
            aria-label="Close confirmation"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </Button>
        </div>
        <div className="mt-6 rounded-control border border-accent-secondary/20 bg-accent-secondary/[0.06] p-4">
          <p className="text-xs font-semibold tracking-[0.15em] text-muted uppercase">
            Booking reference
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <strong className="text-lg tracking-[0.04em]">
              {booking.reference}
            </strong>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void copyReference()}
            >
              {copied ? (
                <CheckCircle2 aria-hidden="true" size={15} />
              ) : (
                <Copy aria-hidden="true" size={15} />
              )}
              {copied ? "Copied" : "Copy Reference"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Keep this reference. You can use it to view your booking later.
          </p>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Car</dt>
            <dd className="mt-1 font-semibold">{carName}</dd>
          </div>
          {isTransfer ? (
            <div>
              <dt className="text-muted">Route</dt>
              <dd className="mt-1 font-semibold">
                {booking.transferPackage?.fromLocation ??
                  booking.pickupLocation}{" "}
                →{" "}
                {booking.transferPackage?.toLocation ?? booking.dropoffLocation}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-muted">Rental days</dt>
              <dd className="mt-1 font-semibold">{booking.rentalDays}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Pickup</dt>
            <dd className="mt-1 font-semibold">
              {booking.pickupLocation}
              <br />
              {formatDateTime(booking.pickupAt)}
            </dd>
          </div>
          {!isTransfer ? (
            <div>
              <dt className="text-muted">Return</dt>
              <dd className="mt-1 font-semibold">
                {booking.dropoffLocation}
                <br />
                {formatDateTime(booking.returnAt)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Booking status</dt>
            <dd className="mt-1 font-semibold text-success">
              {formatStatus(booking.bookingStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Payment status</dt>
            <dd className="mt-1 font-semibold">
              {formatStatus(booking.paymentStatus)}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex items-end justify-between border-t border-border pt-5">
          <span className="text-sm text-muted">Final price</span>
          <strong className="text-2xl tracking-[-0.035em]">
            {formatCurrency(booking.totalPrice, booking.currency)}
          </strong>
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/cars"
            className={buttonStyles({
              className: "flex-1",
              variant: "secondary",
            })}
          >
            Browse Cars
          </Link>
          <Link
            href="/my-bookings"
            className={buttonStyles({ className: "flex-1" })}
          >
            My Booking
          </Link>
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
  const defaultImage =
    car.images.find((image) => image.isDefault) ?? car.images[0];
  const selectedPackage = car.transferPackages.find(
    (item) => item.id === values.transferPackageId,
  );
  const estimate = useMemo(
    () =>
      car.serviceType === "rental"
        ? calculateRentalEstimate(
            values.pickupAt,
            values.returnAt,
            car.dailyPrice,
          )
        : null,
    [car.dailyPrice, car.serviceType, values.pickupAt, values.returnAt],
  );

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmissionError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createBooking.isPending) return;
    const nextErrors = validateForm(values, car);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const commonInput = {
      carId: car.id,
      pickupAt: new Date(values.pickupAt).toISOString(),
      driverFirstName: values.driverFirstName.trim(),
      driverLastName: values.driverLastName.trim(),
      contactEmail: values.contactEmail.trim(),
      contactPhone: values.contactPhone.trim(),
      ...(values.specialRequests.trim()
        ? { specialRequests: values.specialRequests.trim() }
        : {}),
    };
    const input: CreateRentalBookingInput | CreateTransferBookingInput =
      car.serviceType === "rental"
        ? {
            ...commonInput,
            pickupLocation: values.pickupLocation.trim(),
            dropoffLocation: values.dropoffLocation.trim(),
            returnAt: new Date(values.returnAt).toISOString(),
            driverBirthDate: new Date(values.driverBirthDate).toISOString(),
            driverLicenseNumber: values.driverLicenseNumber.trim(),
          }
        : {
            ...commonInput,
            transferPackageId: values.transferPackageId,
          };

    try {
      const createdBooking = await createBooking.mutateAsync(input);
      saveBookingReference(createdBooking.reference);
      setBooking(createdBooking);
    } catch (error) {
      setSubmissionError(
        error instanceof ApiError
          ? error.message
          : "Unable to create the booking. Please try again.",
      );
    }
  }

  const textareaClassName = cn(
    "min-h-28 w-full rounded-control border border-border bg-surface-elevated px-3.5 py-3 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-65",
    errors.specialRequests &&
      "border-danger focus:border-danger focus:ring-red-900/15",
  );

  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <Link
        href={`/cars/${car.id}`}
        className={buttonStyles({
          className: "-ml-3",
          size: "sm",
          variant: "ghost",
        })}
      >
        <ArrowLeft aria-hidden="true" size={17} />
        Back to car
      </Link>
      <div className="mt-6 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-blue-200 bg-blue-50 text-accent">
            {car.serviceType === "rental" ? "Rental" : "Transfer"}
          </Badge>
          {car.withDriver ? <Badge variant="success">With Driver</Badge> : null}
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Complete your booking.
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">
          Review the car and price, then enter the trip and contact details
          required to confirm availability.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] xl:gap-10">
        <aside className="space-y-6">
          <Card padding="none" className="overflow-hidden" variant="elevated">
            <div className="relative aspect-[16/10] bg-[#eef2f7]">
              {defaultImage && !imageFailed ? (
                <Image
                  src={defaultImage.url}
                  alt={`${car.name} rental car`}
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover object-center p-1 sm:p-1"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <span className="grid h-full place-items-center text-sm text-muted">
                  <Clipboard aria-hidden="true" size={24} />
                </span>
              )}
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
                Selected car
              </p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.035em]">
                    {car.name}
                  </h2>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                    <MapPin aria-hidden="true" size={15} />
                    {car.brand} · {car.year} · {car.city}
                  </p>
                </div>
                {car.serviceType === "rental" ? (
                  <p className="text-right text-xl font-semibold">
                    {formatCurrency(car.dailyPrice, car.currency)}
                    <span className="block text-xs font-normal text-muted">
                      / day
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          {car.serviceType === "rental" ? (
            <Card padding="lg" variant="elevated">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Price summary
                  </h2>
                  <InfoTooltip label="This estimate uses the selected rental dates. The server confirms final pricing when you book." />
                </div>
                <Badge>Estimated</Badge>
              </div>
              {estimate ? (
                <>
                  <dl className="mt-6 space-y-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Daily rate</dt>
                      <dd className="font-semibold">
                        {formatCurrency(car.dailyPrice, car.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Rental days</dt>
                      <dd className="font-semibold">{estimate.rentalDays}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Subtotal</dt>
                      <dd className="font-semibold">
                        {formatCurrency(estimate.subtotal, car.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Tax (10%)</dt>
                      <dd className="font-semibold">
                        {formatCurrency(estimate.taxAmount, car.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-border pt-4 text-lg">
                      <dt className="font-semibold">Estimated total</dt>
                      <dd className="font-semibold text-accent">
                        {formatCurrency(estimate.total, car.currency)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-5 text-xs leading-5 text-muted">
                    Final pricing is confirmed by the server when the booking is
                    created.
                  </p>
                </>
              ) : (
                <p className="mt-5 text-sm leading-6 text-muted">
                  Choose valid pickup and return dates to see an estimated
                  rental total.
                </p>
              )}
            </Card>
          ) : (
            <Card padding="lg">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Fixed transfer price
                </h2>
                <InfoTooltip label="Transfer pricing comes from the selected route package and is confirmed by the server when you book." />
              </div>
              {selectedPackage ? (
                <>
                  <p className="mt-5 flex items-start gap-2 text-sm font-semibold">
                    <Waypoints
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-accent"
                      size={17}
                    />
                    {selectedPackage.fromLocation}{" "}
                    <span className="text-accent">→</span>{" "}
                    {selectedPackage.toLocation}
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                    {formatCurrency(
                      selectedPackage.price,
                      selectedPackage.currency,
                    )}
                  </p>
                  <p className="mt-4 text-xs leading-5 text-muted">
                    Fixed package price. The server confirms the final price
                    when the booking is created.
                  </p>
                </>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted">
                  Select a transfer package to see its fixed price.
                </p>
              )}
            </Card>
          )}

          <div className="grid gap-2.5 rounded-card border border-blue-100 bg-[#fbfbfc] p-5 text-sm text-muted">
            <p className="flex gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent"
                size={16}
              />{" "}
              Availability is checked during booking.
            </p>
            <p className="flex gap-2">
              <CircleDollarSign
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent"
                size={16}
              />{" "}
              {car.serviceType === "rental"
                ? "Date-based pricing stays visible before confirmation."
                : "The selected route uses its listed fixed price."}
            </p>
          </div>
        </aside>

        <Card
          variant="elevated"
          padding="none"
          className="overflow-hidden lg:sticky lg:top-6"
        >
          <div className="border-b border-border bg-[#f7f9fc] px-6 py-5 sm:px-8 sm:py-6">
            <p className="text-xs font-semibold tracking-[0.15em] text-accent uppercase">
              Booking form
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
              Booking details
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Required fields are marked in their labels.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <form className="mt-7 space-y-7" noValidate onSubmit={handleSubmit}>
              {car.serviceType === "rental" ? (
                <fieldset
                  disabled={createBooking.isPending}
                  className="grid gap-5"
                >
                  <legend className="mb-4 text-sm font-semibold">
                    Rental details
                  </legend>
                  <Input
                    label="Pickup location"
                    required
                    value={values.pickupLocation}
                    error={errors.pickupLocation}
                    onChange={(event) =>
                      updateValue("pickupLocation", event.target.value)
                    }
                  />
                  <Input
                    label="Dropoff location"
                    required
                    value={values.dropoffLocation}
                    error={errors.dropoffLocation}
                    onChange={(event) =>
                      updateValue("dropoffLocation", event.target.value)
                    }
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input
                      label="Pickup date and time"
                      required
                      type="datetime-local"
                      value={values.pickupAt}
                      error={errors.pickupAt}
                      onChange={(event) =>
                        updateValue("pickupAt", event.target.value)
                      }
                    />
                    <Input
                      label="Return date and time"
                      required
                      type="datetime-local"
                      value={values.returnAt}
                      error={errors.returnAt}
                      onChange={(event) =>
                        updateValue("returnAt", event.target.value)
                      }
                    />
                  </div>
                </fieldset>
              ) : (
                <fieldset
                  disabled={createBooking.isPending}
                  className="grid gap-5"
                >
                  <legend className="mb-1 text-sm font-semibold">
                    Transfer details
                  </legend>
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">Transfer package</p>
                    <div
                      className="grid gap-3"
                      role="radiogroup"
                      aria-label="Transfer package"
                      aria-invalid={Boolean(errors.transferPackageId)}
                    >
                      {car.transferPackages.map((item) => {
                        const isSelected = item.id === values.transferPackageId;
                        return (
                          <label
                            key={item.id}
                            className={cn(
                              "relative flex cursor-pointer items-start gap-3 rounded-control border bg-white p-4 shadow-sm outline-none transition-[border-color,box-shadow,background-color] focus-within:ring-4 focus-within:ring-[var(--ring)]",
                              isSelected
                                ? "border-accent bg-blue-50/60 shadow-[0_0_0_1px_rgba(18,97,201,0.12)]"
                                : "border-border hover:border-blue-300",
                            )}
                          >
                            <input
                              type="radio"
                              name="transferPackageId"
                              value={item.id}
                              checked={isSelected}
                              onChange={(event) =>
                                updateValue(
                                  "transferPackageId",
                                  event.target.value,
                                )
                              }
                              className="sr-only"
                            />
                            <span
                              className={cn(
                                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                                isSelected
                                  ? "border-accent bg-accent text-white"
                                  : "border-border bg-white",
                              )}
                            >
                              {isSelected ? (
                                <Check
                                  aria-hidden="true"
                                  size={13}
                                  strokeWidth={3}
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-5">
                                {item.fromLocation}{" "}
                                <span className="text-accent">→</span>{" "}
                                {item.toLocation}
                              </span>
                              <span className="mt-1.5 block text-base font-semibold">
                                {formatCurrency(item.price, item.currency)}{" "}
                                <span className="text-xs font-medium text-muted">
                                  {item.currency}
                                </span>
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {errors.transferPackageId ? (
                      <p className="text-xs text-danger">
                        {errors.transferPackageId}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    label="Pickup date and time"
                    required
                    type="datetime-local"
                    value={values.pickupAt}
                    error={errors.pickupAt}
                    onChange={(event) =>
                      updateValue("pickupAt", event.target.value)
                    }
                  />
                </fieldset>
              )}
              <fieldset
                disabled={createBooking.isPending}
                className="grid gap-5 border-t border-border pt-7"
              >
                <legend className="mb-4 text-sm font-semibold">
                  {car.serviceType === "rental"
                    ? "Driver information"
                    : "Passenger information"}
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label={
                      car.serviceType === "rental"
                        ? "Driver First Name"
                        : "Passenger First Name"
                    }
                    required
                    value={values.driverFirstName}
                    error={errors.driverFirstName}
                    onChange={(event) =>
                      updateValue("driverFirstName", event.target.value)
                    }
                  />
                  <Input
                    label={
                      car.serviceType === "rental"
                        ? "Driver Last Name"
                        : "Passenger Last Name"
                    }
                    required
                    value={values.driverLastName}
                    error={errors.driverLastName}
                    onChange={(event) =>
                      updateValue("driverLastName", event.target.value)
                    }
                  />
                </div>
                {car.serviceType === "rental" ? (
                  <>
                    <Input
                      label="Birth date"
                      required
                      type="date"
                      value={values.driverBirthDate}
                      error={errors.driverBirthDate}
                      onChange={(event) =>
                        updateValue("driverBirthDate", event.target.value)
                      }
                    />
                    <Input
                      label="Driver license number"
                      required
                      value={values.driverLicenseNumber}
                      error={errors.driverLicenseNumber}
                      onChange={(event) =>
                        updateValue("driverLicenseNumber", event.target.value)
                      }
                    />
                  </>
                ) : null}
              </fieldset>
              <fieldset
                disabled={createBooking.isPending}
                className="grid gap-5 border-t border-border pt-7"
              >
                <legend className="mb-4 text-sm font-semibold">
                  Contact information
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Email"
                    required
                    type="email"
                    value={values.contactEmail}
                    error={errors.contactEmail}
                    onChange={(event) =>
                      updateValue("contactEmail", event.target.value)
                    }
                  />
                  <Input
                    label="Phone"
                    required
                    type="tel"
                    value={values.contactPhone}
                    error={errors.contactPhone}
                    onChange={(event) =>
                      updateValue("contactPhone", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="special-requests"
                  >
                    Special requests{" "}
                    <span className="text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="special-requests"
                    className={textareaClassName}
                    value={values.specialRequests}
                    onChange={(event) =>
                      updateValue("specialRequests", event.target.value)
                    }
                  />
                </div>
              </fieldset>
              {submissionError ? (
                <p
                  aria-live="polite"
                  className="rounded-control border border-danger/20 bg-red-900/[0.06] px-4 py-3 text-sm leading-6 text-danger"
                >
                  {submissionError}
                </p>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                type="submit"
                disabled={createBooking.isPending}
              >
                {createBooking.isPending ? (
                  <>
                    <RotateCcw
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                    Creating booking...
                  </>
                ) : (
                  "Confirm Booking"
                )}
              </Button>
            </form>
          </div>
        </Card>
      </div>
      {booking ? (
        <BookingSuccessModal
          booking={booking}
          carName={car.name}
          isTransfer={car.serviceType === "transfer"}
          onClose={() => setBooking(null)}
        />
      ) : null}
    </PageContainer>
  );
}

export function BookingForm({ carId }: BookingFormProps) {
  return <CarFetchState carId={carId} />;
}
