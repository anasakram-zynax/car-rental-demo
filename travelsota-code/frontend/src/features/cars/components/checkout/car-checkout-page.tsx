"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BookingLayout } from "@/components/booking/booking-layout";
import { CountrySelect } from "@/components/booking/country-select";
import { PayPalPaymentButton } from "@/components/payment/paypal-payment-button";
import { StripePaymentForm } from "@/components/payment/stripe-payment-form";
import { Button } from "@/components/ui/button";
import { PremiumError } from "@/components/ui/state/premium-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrencyDisplay } from "@/context/CurrencyContext";
import { useCountries } from "@/features/reference/hooks";
import { getGuestBookingStatus } from "@/features/admin/api/admin-settings";
import { useAuth } from "@/hooks/useAuth";
import { normalizePhoneParts } from "@/lib/utils/validation";
import { useCarCheckout, useCarLocation, useCarsSearch } from "../../hooks";
import type {
  CarCheckoutInput,
  CarCheckoutResponse,
  CarSearchResult,
} from "../../types";
import type { CarResultsContext } from "../../utils/car-results-route";
import { toCarsSearchQuery } from "../../utils/car-results-route";
import { resolveCarContactName } from "../../utils/car-checkout";

const ease = [0.16, 1, 0.3, 1] as const;
const inputClass =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition-all duration-150 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/10";

function formatDate(value: string) {
  const date = new Date(value);
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
function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return `cars-${crypto.randomUUID()}`;
  return `cars-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CarCheckoutPage({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const reducedMotion = useReducedMotion();
  const { data: countries = [] } = useCountries();
  const { formatPrice } = useCurrencyDisplay();
  const [quantity, setQuantity] = useState(1);
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");
  const [title, setTitle] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [countryIso2, setCountryIso2] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [bookingForOther, setBookingForOther] = useState(false);
  const [bookingMode, setBookingMode] = useState<"guest" | "login">("guest");
  const [guestBookingEnabled, setGuestBookingEnabled] = useState(true);
  const [driverTitle, setDriverTitle] = useState("");
  const [driverFirstName, setDriverFirstName] = useState("");
  const [driverLastName, setDriverLastName] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CarCheckoutResponse | null>(null);
  const [paid, setPaid] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);
  const mutation = useCarCheckout();

  useEffect(() => {
    if (!auth.user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstName(auth.user.firstName ?? "");
    setLastName(auth.user.lastName ?? "");
    setEmail(auth.user.email ?? "");
    setPhone(auth.user.phone ?? "");
    setBookingMode("login");
  }, [auth.user]);

  useEffect(() => {
    getGuestBookingStatus()
      .then((status) => setGuestBookingEnabled(status.enabled))
      .catch(() => undefined);
  }, []);

  function toggleBookingForOther(checked: boolean) {
    if (checked && !bookingForOther) {
      setDriverTitle(title);
      setDriverFirstName(firstName);
      setDriverLastName(lastName);
    }
    setBookingForOther(checked);
  }

  const context = useMemo<CarResultsContext | null>(() => {
    const serviceType = params.get("serviceType");
    const pickupLocationId = params.get("pickupLocationId");
    const pickupAt = params.get("pickupAt");
    if (!pickupLocationId || !pickupAt) return null;
    if (serviceType === "rental") {
      const returnLocationId = params.get("returnLocationId");
      const dropoffAt = params.get("dropoffAt");
      return returnLocationId && dropoffAt
        ? {
            serviceType,
            pickupLocationId,
            returnLocationId,
            pickupAt,
            dropoffAt,
          }
        : null;
    }
    if (serviceType === "transfer") {
      const dropoffLocationId = params.get("dropoffLocationId");
      return dropoffLocationId
        ? { serviceType, pickupLocationId, dropoffLocationId, pickupAt }
        : null;
    }
    return null;
  }, [params]);
  const query = useMemo(
    () =>
      context
        ? {
            ...toCarsSearchQuery(context, new URLSearchParams()),
            page: 1,
            pageSize: 100,
          }
        : null,
    [context],
  );
  const search = useCarsSearch(query);
  const result = search.data?.items.find(
    (item) =>
      (item.serviceType === "rental" ? item.id : item.packageId) ===
      decodeURIComponent(id),
  );
  const returnLocationId =
    context?.serviceType === "rental" &&
    context.returnLocationId !== context.pickupLocationId
      ? context.returnLocationId
      : undefined;
  const returnLocation = useCarLocation(returnLocationId);
  const fleet = result?.serviceType === "transfer" ? result.fleet : result;
  const currency = result?.currency ?? fleet?.currency ?? "USD";
  const rentalDays =
    context?.serviceType === "rental"
      ? Math.max(
          1,
          Math.ceil(
            (new Date(context.dropoffAt).getTime() -
              new Date(context.pickupAt).getTime()) /
              86_400_000,
          ),
        )
      : 1;
  const estimate = result ? result.price * rentalDays * quantity : 0;
  const maxQuantity =
    result?.serviceType === "rental"
      ? Math.max(1, result.availability.availableQuantity)
      : undefined;
  const knownDialCodes = useMemo(
    () => countries.map((country) => country.dialCode),
    [countries],
  );
  const paymentSuccess = useCallback(() => {
    setPaymentError(null);
    setPaid(true);
  }, []);
  const paymentFailure = useCallback(
    (message: string) => setPaymentError(message),
    [],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttemptedSubmit(true);
    setFormError(null);
    setPaymentError(null);
    if (!result || !fleet || !context) return;
    if (
      bookingMode === "guest" &&
      !auth.isAuthenticated &&
      !guestBookingEnabled
    ) {
      setFormError("Guest booking is currently disabled. Sign in to continue.");
      return;
    }
    if (
      !title ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !countryCode ||
      !phone.trim()
    ) {
      setFormError("Complete all required customer details before continuing.");
      return;
    }
    if (
      bookingForOther &&
      (!driverTitle || !driverFirstName.trim() || !driverLastName.trim())
    ) {
      setFormError("Complete the primary driver details before continuing.");
      return;
    }
    if (!agreeTerms) return;
    if (returnLocationId && !returnLocation.data) {
      setFormError("The return location is still loading. Please try again.");
      return;
    }
    const pickupLocation =
      result.serviceType === "transfer"
        ? result.pickupLocation.label
        : fleet.location.label;
    const dropoffLocation =
      result.serviceType === "transfer"
        ? result.dropoffLocation.label
        : (returnLocation.data?.label ?? fleet.location.label);
    const payload: CarCheckoutInput = {
      serviceType: result.serviceType,
      pickupLocation,
      dropoffLocation,
      pickupAt: context.pickupAt,
      quantity,
      contactName: resolveCarContactName({
        bookingForOther,
        guest: { title, firstName, lastName },
        driver: {
          title: driverTitle,
          firstName: driverFirstName,
          lastName: driverLastName,
        },
      }),
      contactEmail: email.trim(),
      contactPhone: normalizePhoneParts(countryCode, phone, knownDialCodes)
        .e164,
      gateway: gateway === "stripe" ? "STRIPE" : "PAYPAL",
      idempotencyKey,
      successUrl: `${window.location.origin}/my-bookings`,
      cancelUrl: window.location.href,
      ...(result.serviceType === "rental" && context.serviceType === "rental"
        ? { fleetId: result.id, dropoffAt: context.dropoffAt }
        : result.serviceType === "transfer"
          ? { transferPackageId: result.packageId }
          : {}),
    };
    try {
      setCheckout(await mutation.mutateAsync(payload));
    } catch (error) {
      setFormError(
        (error as { message?: string }).message ??
          "Checkout could not be started. Availability or pricing may have changed.",
      );
    }
  }

  if (!context)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <PremiumError message="This Cars checkout link is incomplete. Return to search and select the car again." />
      </div>
    );
  if (search.isLoading || auth.isAuthLoading) return <CheckoutSkeleton />;
  if (search.isError || !result || !fleet)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <PremiumError
          message={
            (search.error as { message?: string })?.message ??
            "This car is no longer available for the selected journey."
          }
          onRetry={() => void search.refetch()}
        />
      </div>
    );

  const requestedReturnTo = params.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/cars/")
    ? requestedReturnTo
    : "/cars";
  const image = [...(fleet.images ?? [])].sort((a, b) => a.order - b.order)[0];
  const pickupLabel =
    result.serviceType === "transfer"
      ? result.pickupLocation.label
      : fleet.location.label;
  const dropoffLabel =
    result.serviceType === "transfer"
      ? result.dropoffLocation.label
      : (returnLocation.data?.label ?? fleet.location.label);
  const sidebar = (
    <CarsSummary
      result={result}
      image={image?.url}
      pickupLabel={pickupLabel}
      dropoffLabel={dropoffLabel}
      pickupAt={context.pickupAt}
      dropoffAt={
        context.serviceType === "rental" ? context.dropoffAt : undefined
      }
      rentalDays={rentalDays}
      quantity={quantity}
      estimate={estimate}
      checkout={checkout}
      formatPrice={formatPrice}
    />
  );
  const sectionMotion = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease },
      };

  return (
    <BookingLayout
      title={fleet.displayName}
      backHref={returnTo}
      backLabel="Back to car details"
      sidebar={sidebar}
    >
      <motion.header {...sectionMotion} className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          Complete your booking
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Fill in the customer details for {fleet.displayName}, then choose a
          secure payment method.
        </p>
      </motion.header>
      {auth.isAgent || auth.isAdmin ? (
        <AuthRequired
          redirect={`/booking/cars/${encodeURIComponent(id)}/details?${params.toString()}`}
          wrongAccount
        />
      ) : (
        <form onSubmit={submit}>
          <motion.section {...sectionMotion} className="mb-7">
            <SectionHeading>Booking as</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <BookingModeCard
                title="Guest Booking"
                subtitle={
                  guestBookingEnabled
                    ? "Book without an account."
                    : "Guest booking is currently disabled."
                }
                selected={bookingMode === "guest"}
                disabled={!guestBookingEnabled}
                onClick={() => setBookingMode("guest")}
              />
              <BookingModeCard
                title="Login to Book"
                subtitle="Use your account details and manage this booking."
                selected={bookingMode === "login"}
                onClick={() => {
                  if (auth.isAuthenticated) {
                    setBookingMode("login");
                    return;
                  }
                  const redirect = `/booking/cars/${encodeURIComponent(id)}/details?${params.toString()}`;
                  router.push(
                    `/signin?redirect=${encodeURIComponent(redirect)}`,
                  );
                }}
              />
            </div>
            {!guestBookingEnabled && !auth.isAuthenticated ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Guest booking is currently disabled. Choose Login to Book to
                continue with an account.
              </p>
            ) : null}
          </motion.section>

          <motion.section
            {...sectionMotion}
            transition={
              reducedMotion ? undefined : { duration: 0.4, delay: 0.08, ease }
            }
            className="mb-7"
          >
            <SectionHeading>Customer details</SectionHeading>
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Title" required>
                  <select
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Select</option>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Miss</option>
                    <option>Ms</option>
                    <option>Dr</option>
                  </select>
                </Field>
                <Field label="First name" required>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass}
                    placeholder="First name"
                    required
                  />
                </Field>
                <Field label="Last name" required>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                    placeholder="Last name"
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                    required
                  />
                </Field>
                <Field label="Country code" required>
                  <CountrySelect
                    value={countryIso2}
                    onChange={(code, country) => {
                      setCountryIso2(code);
                      if (country) setCountryCode(country.dialCode);
                    }}
                    countries={countries}
                    mode="dial"
                    aria-label="Country calling code"
                  />
                </Field>
                <Field label="Phone" required>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                    placeholder="Phone number"
                    required
                  />
                </Field>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={bookingForOther}
                  onChange={(e) => toggleBookingForOther(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-teal"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-800">
                    I’m booking for someone else
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Enter separate primary driver details below.
                  </span>
                </span>
              </label>
            </div>
          </motion.section>

          <motion.section
            {...sectionMotion}
            transition={
              reducedMotion ? undefined : { duration: 0.4, delay: 0.12, ease }
            }
            className="mb-7"
          >
            <SectionHeading>Primary customer</SectionHeading>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-700">
                    Lead renter
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
                    Primary customer
                  </span>
                </div>
                {!bookingForOther ? (
                  <span className="text-[10px] italic text-zinc-400">
                    Synced with guest details
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Title" required>
                  <select
                    value={bookingForOther ? driverTitle : title}
                    onChange={(e) => setDriverTitle(e.target.value)}
                    disabled={!bookingForOther}
                    className={`${inputClass} ${!bookingForOther ? "cursor-not-allowed bg-zinc-50 text-zinc-500" : ""}`}
                  >
                    <option value="">Select</option>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Miss</option>
                    <option>Ms</option>
                    <option>Dr</option>
                  </select>
                </Field>
                <Field label="First name" required>
                  <input
                    value={bookingForOther ? driverFirstName : firstName}
                    onChange={(e) => setDriverFirstName(e.target.value)}
                    disabled={!bookingForOther}
                    className={`${inputClass} ${!bookingForOther ? "cursor-not-allowed bg-zinc-50 text-zinc-500" : ""}`}
                  />
                </Field>
                <Field label="Last name" required>
                  <input
                    value={bookingForOther ? driverLastName : lastName}
                    onChange={(e) => setDriverLastName(e.target.value)}
                    disabled={!bookingForOther}
                    className={`${inputClass} ${!bookingForOther ? "cursor-not-allowed bg-zinc-50 text-zinc-500" : ""}`}
                  />
                </Field>
              </div>
            </div>
          </motion.section>

          <motion.section
            {...sectionMotion}
            transition={
              reducedMotion ? undefined : { duration: 0.4, delay: 0.16, ease }
            }
            className="mb-7"
          >
            <SectionHeading>Booking options</SectionHeading>
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <Field label="Vehicle quantity" required>
                <input
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(
                          maxQuantity ?? 99,
                          Number(e.target.value) || 1,
                        ),
                      ),
                    )
                  }
                  className={inputClass}
                />
              </Field>
              <p className="mt-2 text-xs text-zinc-500">
                {maxQuantity
                  ? `Up to ${maxQuantity} currently available. `
                  : ""}
                Availability is revalidated at checkout.
              </p>
            </div>
          </motion.section>

          <motion.section
            {...sectionMotion}
            transition={
              reducedMotion ? undefined : { duration: 0.4, delay: 0.2, ease }
            }
            className="mb-7"
          >
            <SectionHeading>Payment method</SectionHeading>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PaymentCard
                title="Credit Card"
                subtitle="Powered by Stripe"
                selected={gateway === "stripe"}
                onClick={() => setGateway("stripe")}
                icon={<CardIcon />}
              />
              <PaymentCard
                title="Digital Wallet"
                subtitle="Pay with PayPal"
                selected={gateway === "paypal"}
                onClick={() => setGateway("paypal")}
                icon={<WalletIcon />}
              />
              <PaymentCard
                title="Pay Later"
                subtitle="Disabled"
                disabled
                selected={false}
                onClick={() => undefined}
                icon={<ClockIcon />}
              />
              <PaymentCard
                title="Bank Transfer"
                subtitle="Disabled"
                disabled
                selected={false}
                onClick={() => undefined}
                icon={<BankIcon />}
              />
            </div>
          </motion.section>

          <motion.section
            {...sectionMotion}
            transition={
              reducedMotion ? undefined : { duration: 0.4, delay: 0.24, ease }
            }
            className="mb-7"
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-teal"
              />
              <span className="text-sm text-zinc-700">
                I agree to the{" "}
                <Link href="/terms" className="text-brand-teal underline">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-brand-teal underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {attemptedSubmit && !agreeTerms ? (
              <p className="mt-2 text-xs font-medium text-red-600">
                You must accept the terms before continuing.
              </p>
            ) : null}
          </motion.section>

          <AnimatePresence>
            {formError ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
              >
                {formError}
              </motion.div>
            ) : null}
          </AnimatePresence>
          {!checkout ? (
            <motion.div
              {...sectionMotion}
              transition={
                reducedMotion ? undefined : { duration: 0.4, delay: 0.28, ease }
              }
            >
              <Button
                type="submit"
                size="lg"
                loading={mutation.isPending}
                disabled={
                  returnLocation.isLoading ||
                  (!auth.isAuthenticated && !guestBookingEnabled)
                }
                className="w-full"
              >
                <LockIcon />
                {mutation.isPending
                  ? "Revalidating availability and price…"
                  : `Confirm Booking — ${formatPrice(estimate, currency)}`}
              </Button>
              <p className="mt-3 text-center text-xs text-zinc-400">
                Final availability and price are confirmed before payment.
              </p>
            </motion.div>
          ) : null}

          <AnimatePresence mode="wait">
            {checkout && !paid ? (
              <motion.section
                key="payment"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Booking {checkout.bookingRef} is awaiting payment.
                  Authoritative total:{" "}
                  {formatPrice(checkout.amount, checkout.currency)}.
                </div>
                {paymentError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {paymentError}
                  </div>
                ) : null}
                {gateway === "stripe" && checkout.clientSecret ? (
                  <StripePaymentForm
                    clientSecret={checkout.clientSecret}
                    paymentId={checkout.paymentId}
                    bookingId={checkout.bookingId}
                    amount={checkout.amount}
                    currency={checkout.currency}
                    onSuccess={paymentSuccess}
                    onError={paymentFailure}
                  />
                ) : null}
                {gateway === "paypal" && checkout.checkoutUrl ? (
                  <PayPalPaymentButton
                    paymentId={checkout.paymentId}
                    checkoutUrl={checkout.checkoutUrl}
                    amount={checkout.amount}
                    currency={checkout.currency}
                    onSuccess={paymentSuccess}
                    onError={paymentFailure}
                    containerId={`cars-paypal-${checkout.paymentId}`}
                  />
                ) : null}
                {(gateway === "stripe" && !checkout.clientSecret) ||
                (gateway === "paypal" && !checkout.checkoutUrl) ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    The selected provider did not return the information
                    required to continue. No successful payment has been
                    recorded.
                  </div>
                ) : null}
              </motion.section>
            ) : null}
            {checkout && paid ? (
              <motion.section
                key="success"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-6"
              >
                <h2 className="text-xl font-bold text-emerald-900">
                  Payment completed
                </h2>
                <p className="mt-2 text-sm text-emerald-800">
                  Booking reference: {checkout.bookingRef}
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  Latest status: {checkout.status.replaceAll("_", " ")}
                </p>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </form>
      )}
    </BookingLayout>
  );
}

function CarsSummary({
  result,
  image,
  pickupLabel,
  dropoffLabel,
  pickupAt,
  dropoffAt,
  rentalDays,
  quantity,
  estimate,
  checkout,
  formatPrice,
}: {
  result: CarSearchResult;
  image?: string;
  pickupLabel: string;
  dropoffLabel: string;
  pickupAt: string;
  dropoffAt?: string;
  rentalDays: number;
  quantity: number;
  estimate: number;
  checkout: CarCheckoutResponse | null;
  formatPrice: (amount: number, currency: string) => string;
}) {
  const fleet = result.serviceType === "transfer" ? result.fleet : result;
  const currency = checkout?.currency ?? result.currency;
  const total = checkout?.amount ?? estimate;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay: 0.15 }}
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_16px_rgba(3,61,74,0.06)]">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight text-charcoal">
            Booking summary
          </h2>
        </div>
        {image ? (
          <div className="relative aspect-[16/9] overflow-hidden">
            <Image
              src={image}
              alt={fleet.displayName}
              fill
              sizes="380px"
              className="object-cover transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/75">
                {result.serviceType}
              </span>
              <h3 className="mt-0.5 text-base font-bold text-white">
                {fleet.displayName}
              </h3>
            </div>
          </div>
        ) : null}
        <div className="space-y-5 px-5 py-4">
          <p className="text-xs capitalize text-zinc-500">
            {fleet.category} · {fleet.transmission ?? "Transmission not listed"}{" "}
            · {fleet.passengerCapacity} passengers ·{" "}
            {fleet.luggageCapacity ?? 0} luggage
          </p>
          <div className="space-y-2.5 rounded-xl bg-zinc-50/80 px-3.5 py-3.5 text-sm">
            <SummaryRow label="Pick-up" value={pickupLabel} />
            <SummaryRow label="Drop-off" value={dropoffLabel} />
            <SummaryRow label="Pick-up time" value={formatDate(pickupAt)} />
            {dropoffAt ? (
              <SummaryRow label="Drop-off time" value={formatDate(dropoffAt)} />
            ) : null}
            {result.serviceType === "rental" ? (
              <SummaryRow
                label="Rental duration"
                value={`${rentalDays} day${rentalDays === 1 ? "" : "s"}`}
              />
            ) : null}
            <SummaryRow label="Quantity" value={String(quantity)} />
          </div>
          <div className="space-y-3 rounded-xl border border-zinc-200/80 p-3.5">
            <div>
              <p className="text-sm font-semibold text-charcoal">
                Selected car
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {fleet.displayName} × {quantity}
              </p>
            </div>
            <div className="space-y-1.5 border-t border-zinc-100 pt-3 text-sm">
              <SummaryRow
                label={
                  result.serviceType === "rental"
                    ? "Daily rate"
                    : "Transfer package"
                }
                value={formatPrice(result.price, result.currency)}
              />
              {result.serviceType === "rental" ? (
                <SummaryRow label="Rental days" value={String(rentalDays)} />
              ) : null}
              <SummaryRow label="Quantity" value={String(quantity)} />
              <SummaryRow
                label="Subtotal"
                value={formatPrice(total, currency)}
              />
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <SummaryRow
              label="Taxes & fees"
              value="Included"
              valueClass="font-semibold text-emerald-600"
            />
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2.5">
              <span className="text-base font-bold text-charcoal">
                {checkout ? "Authoritative total" : "Estimated total"}
              </span>
              <span className="text-lg font-black tracking-tight text-brand-teal">
                {formatPrice(total, currency)}
              </span>
            </div>
            <p className="text-[11px] leading-4 text-zinc-500">
              {checkout
                ? "Revalidated by the Cars checkout service."
                : "The backend confirms final availability and price before payment."}
            </p>
          </div>
          <div className="space-y-2.5 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100/50 px-4 py-3.5 text-[13px]">
            <TrustRow
              icon="mail"
              text="Booking updates are sent to your contact email."
            />
            <TrustRow
              icon="lock"
              text="Payment is processed through the secure configured gateway."
            />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_2px_16px_rgba(3,61,74,0.04)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Booking terms
        </p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-zinc-800">Cancellation</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Cars bookings may be cancelled at least 24 hours before pickup.
            Refund handling depends on the completed payment and provider
            support.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function AuthRequired({
  redirect,
  wrongAccount,
}: {
  redirect: string;
  wrongAccount: boolean;
}) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-base font-semibold">Customer sign-in required</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {wrongAccount
            ? "Cars checkout is available through a customer account."
            : "Sign in to continue. Your selected car and journey will be preserved."}
        </p>
        {!wrongAccount ? (
          <div className="mt-4 flex justify-center gap-3">
            <Link href={`/signin?redirect=${encodeURIComponent(redirect)}`}>
              <Button size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button variant="secondary" size="sm">
                Create account
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
function BookingModeCard({
  title,
  subtitle,
  selected,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`relative flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left ${disabled ? "border-zinc-100 bg-zinc-50 opacity-45" : selected ? "border-zinc-900 bg-zinc-900/[0.02]" : "border-zinc-200 bg-white"}`}
    >
      {selected ? (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900">
          <CheckIcon />
        </span>
      ) : null}
      <span className="text-sm font-semibold text-zinc-900">{title}</span>
      <span className="text-xs text-zinc-500">{subtitle}</span>
    </motion.button>
  );
}
function PaymentCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease }}
      className={`relative flex flex-col items-center gap-2.5 rounded-lg border-2 p-4 text-center transition-all duration-150 ${disabled ? "cursor-not-allowed border-zinc-100 bg-zinc-50 opacity-40" : selected ? "border-zinc-900 bg-zinc-900/[0.02]" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
    >
      {selected && !disabled ? (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900"
        >
          <CheckIcon />
        </motion.span>
      ) : null}
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${selected && !disabled ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
    </motion.button>
  );
}
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">
      {children}
    </h2>
  );
}
function SummaryRow({
  label,
  value,
  valueClass = "font-medium text-charcoal",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right ${valueClass}`}>{value}</span>
    </div>
  );
}
function TrustRow({ icon, text }: { icon: "mail" | "lock"; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-zinc-600">
      {icon === "mail" ? (
        <svg
          className="h-4 w-4 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
        </svg>
      ) : (
        <LockIcon />
      )}
      <span className="font-medium">{text}</span>
    </div>
  );
}
function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <Skeleton width="35%" />
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <Skeleton variant="rect" className="h-[620px]" />
          <Skeleton variant="rect" className="h-[520px]" />
        </div>
      </div>
    </div>
  );
}
function CheckIcon() {
  return (
    <svg
      className="h-3 w-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-current"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path d="M3 6h18v12H3zM3 10h18" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path d="M4 6h15v12H4zM15 10h6v4h-6z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function BankIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M2 18h20M12 3l9 6H3z" />
    </svg>
  );
}
