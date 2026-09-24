"use client";

import { AlertCircle, ArrowLeft, CalendarDays, ChevronRight, CreditCard, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { BookingStatusBadge, PaymentStatusBadge } from "@/features/cars/components/booking/booking-status-badge";
import { useAdminBooking, useAdminBookings, useUpdateAdminBookingPaymentStatus } from "@/features/cars/hooks/use-admin-bookings";
import type { CarBooking, PaymentStatus } from "@/features/cars/types/car.types";
import { getTransferPackageRoute, isTransferBooking } from "@/features/cars/utils/booking-display";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

function ErrorNotice({ error }: { error: unknown }) { return <div role="alert" className="flex items-start gap-3 rounded-control border border-danger/20 bg-red-900/[0.06] px-4 py-3 text-sm text-danger"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><span>{error instanceof Error ? error.message : "Unable to load bookings. Please try again."}</span></div>; }
function BookingSkeleton() { return <div className="space-y-3 p-5"><div className="h-5 w-1/3 animate-pulse rounded bg-black/[0.08]" /><div className="h-14 animate-pulse rounded bg-black/[0.06]" /><div className="h-14 animate-pulse rounded bg-black/[0.06]" /></div>; }

export function AdminBookings() {
  const query = useAdminBookings();
  const [search, setSearch] = useState("");
  const bookings = useMemo(() => { const term = search.trim().toLowerCase(); if (!term) return query.data ?? []; return (query.data ?? []).filter((booking) => `${booking.reference} ${booking.driverFirstName} ${booking.driverLastName} ${booking.contactEmail}`.toLowerCase().includes(term)); }, [query.data, search]);
  return <PageContainer className="py-8 sm:py-12"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Booking management</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bookings</h1><p className="mt-3 text-muted">Review reservations and manage payment status.</p></div><div className="relative mt-8 max-w-md"><Input label="Search bookings" placeholder="Reference, driver, or email" value={search} onChange={(event) => setSearch(event.target.value)} /><Search aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 text-muted" size={16} /></div><Surface variant="glass" className="mt-6 overflow-hidden" padding="none"><div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6"><div><h2 className="font-semibold">All bookings</h2><p className="mt-1 text-sm text-muted">{query.data ? `${bookings.length} of ${query.data.length} bookings` : "Loading bookings..."}</p></div></div>{query.isPending ? <BookingSkeleton /> : null}{query.isError ? <div className="p-5"><ErrorNotice error={query.error} /><Button className="mt-4" variant="secondary" onClick={() => void query.refetch()}>Try Again</Button></div> : null}{query.data && !query.isError ? bookings.length ? <><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-border bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-muted"><tr><th className="px-6 py-3">Reference</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Journey</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{bookings.map((booking) => <BookingTableRow key={booking.reference} booking={booking} />)}</tbody></table></div><div className="divide-y divide-border lg:hidden">{bookings.map((booking) => <BookingMobileCard key={booking.reference} booking={booking} />)}</div></> : <EmptyBookings hasSearch={Boolean(search.trim())} /> : null}</Surface></PageContainer>;
}

function BookingTableRow({ booking }: { booking: CarBooking }) { const isTransfer = isTransferBooking(booking); const route = getTransferPackageRoute(booking); return <tr><td className="px-6 py-4 font-semibold">{booking.reference}</td><td className="px-4 py-4"><p className="font-medium">{booking.driverFirstName} {booking.driverLastName}</p><p className="mt-1 text-xs text-muted">{booking.contactEmail}</p></td><td className="px-4 py-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={isTransfer ? "accent" : "neutral"}>{isTransfer ? "Transfer" : "Rental"}</Badge><p>{isTransfer ? route ?? "Package details unavailable" : `${booking.pickupLocation} → ${booking.dropoffLocation}`}</p></div><p className="mt-1 text-xs text-muted">{formatDate(booking.pickupAt)}{isTransfer ? "" : ` · ${booking.rentalDays} day${booking.rentalDays === 1 ? "" : "s"}`}</p></td><td className="px-4 py-4 font-medium">{isTransfer ? booking.transferPackage ? `${formatCurrency(booking.transferPackage.price, booking.transferPackage.currency)} ${booking.transferPackage.currency}` : "Package details unavailable" : formatCurrency(booking.totalPrice, booking.currency)}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><BookingStatusBadge status={booking.bookingStatus} /><PaymentStatusBadge status={booking.paymentStatus} /></div></td><td className="px-6 py-4 text-right"><Link className={buttonStyles({ size: "sm", variant: "ghost" })} href={`/admin/bookings/${encodeURIComponent(booking.reference)}`}>View <ChevronRight aria-hidden="true" size={15} /></Link></td></tr>; }
function BookingMobileCard({ booking }: { booking: CarBooking }) { const isTransfer = isTransferBooking(booking); const route = getTransferPackageRoute(booking); return <article className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{booking.reference}</p><p className="mt-1 text-sm text-muted">{booking.driverFirstName} {booking.driverLastName}</p><Badge className="mt-2" variant={isTransfer ? "accent" : "neutral"}>{isTransfer ? "Transfer" : "Rental"}</Badge></div><div className="flex flex-col items-end gap-1"><BookingStatusBadge status={booking.bookingStatus} /><PaymentStatusBadge status={booking.paymentStatus} /></div></div><div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{isTransfer ? <><p><span className="text-muted">Route</span><br /><strong>{route ?? "Package details unavailable"}</strong></p><p><span className="text-muted">Pickup</span><br /><strong>{formatDateTime(booking.pickupAt)}</strong></p><p><span className="text-muted">Package price</span><br /><strong>{booking.transferPackage ? `${formatCurrency(booking.transferPackage.price, booking.transferPackage.currency)} ${booking.transferPackage.currency}` : "Package details unavailable"}</strong></p></> : <><p><span className="text-muted">Pickup</span><br /><strong>{booking.pickupLocation}</strong><br />{formatDateTime(booking.pickupAt)}</p><p><span className="text-muted">Return</span><br /><strong>{booking.dropoffLocation}</strong><br />{formatDateTime(booking.returnAt)}</p><p><span className="text-muted">Rental days</span><br /><strong>{booking.rentalDays}</strong></p><p><span className="text-muted">Total</span><br /><strong>{formatCurrency(booking.totalPrice, booking.currency)}</strong></p></>}</div><Link href={`/admin/bookings/${encodeURIComponent(booking.reference)}`} className={buttonStyles({ className: "mt-5 w-full", variant: "secondary" })}>View booking <ChevronRight aria-hidden="true" size={16} /></Link></article>; }
function EmptyBookings({ hasSearch }: { hasSearch: boolean }) { return <div className="grid min-h-56 place-items-center p-6 text-center"><div><CalendarDays aria-hidden="true" className="mx-auto text-muted" size={28} /><p className="mt-3 font-semibold">{hasSearch ? "No matching bookings" : "No bookings yet"}</p><p className="mt-1 text-sm text-muted">{hasSearch ? "Try another reference, name, or email." : "Bookings will appear here when customers reserve a car."}</p></div></div>; }

function nextPaymentStatus(status: PaymentStatus): Extract<PaymentStatus, "paid" | "refunded"> | null { return status === "unpaid" ? "paid" : status === "paid" ? "refunded" : null; }
function PaymentControl({ booking }: { booking: CarBooking }) { const mutation = useUpdateAdminBookingPaymentStatus(); const [confirmStatus, setConfirmStatus] = useState<Extract<PaymentStatus, "paid" | "refunded"> | null>(null); const [error, setError] = useState<string | null>(null); const target = nextPaymentStatus(booking.paymentStatus); async function update() { if (!confirmStatus) return; setError(null); try { await mutation.mutateAsync({ reference: booking.reference, paymentStatus: confirmStatus }); setConfirmStatus(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update payment status."); } } if (!target) return <PaymentStatusBadge status={booking.paymentStatus} />; const label = target === "paid" ? "Mark as Paid" : "Mark as Refunded"; return <><Button disabled={mutation.isPending} onClick={() => setConfirmStatus(target)}>{label}</Button>{error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}{confirmStatus ? <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={() => setConfirmStatus(null)}><section role="dialog" aria-modal="true" aria-labelledby="payment-confirm-title" className="w-full max-w-md rounded-card border border-border bg-surface-elevated p-6 shadow-elevated" onMouseDown={(event) => event.stopPropagation()}><h2 id="payment-confirm-title" className="text-xl font-semibold">{confirmStatus === "paid" ? "Mark this booking as paid?" : "Mark this payment as refunded?"}</h2><p className="mt-3 text-sm leading-6 text-muted">Booking: {booking.reference}. This payment transition cannot be reversed from this screen.</p><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" disabled={mutation.isPending} onClick={() => setConfirmStatus(null)}>Cancel</Button><Button disabled={mutation.isPending} onClick={() => void update()}>{mutation.isPending ? "Updating…" : confirmStatus === "paid" ? "Mark as Paid" : "Mark as Refunded"}</Button></div></section></div> : null}</>; }

export function AdminBookingDetail({ reference }: { reference: string }) {
  const query = useAdminBooking(reference);

  if (query.isPending) return <DetailShell><div className="space-y-5"><div className="h-36 animate-pulse rounded-card bg-black/[0.07]" /><div className="h-64 animate-pulse rounded-card bg-black/[0.07]" /></div></DetailShell>;
  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <DetailShell><Surface variant="elevated" padding="lg" className="max-w-xl"><h1 className="text-2xl font-semibold">{notFound ? "Booking not found" : "Unable to load booking"}</h1><p className="mt-3 text-muted">{notFound ? "This booking reference does not exist." : "Please check your connection and try again."}</p>{!notFound ? <Button className="mt-6" onClick={() => void query.refetch()}>Try Again</Button> : null}</Surface></DetailShell>;
  }

  const booking = query.data;
  const isTransfer = isTransferBooking(booking);
  const transferRoute = getTransferPackageRoute(booking);
  const journeyItems: [string, string | null][] = isTransfer
    ? [
        ["Service type", "Transfer"],
        ["Package route", transferRoute ?? "Package details unavailable"],
        ["Package price", booking.transferPackage ? `${formatCurrency(booking.transferPackage.price, booking.transferPackage.currency)} ${booking.transferPackage.currency}` : "Package details unavailable"],
        ["Pickup", formatDateTime(booking.pickupAt)],
      ]
    : [
        ["Service type", "Rental"],
        ["Pickup", `${booking.pickupLocation} · ${formatDateTime(booking.pickupAt)}`],
        ["Return", `${booking.dropoffLocation} · ${formatDateTime(booking.returnAt)}`],
        ["Rental days", String(booking.rentalDays)],
        ["Daily price", formatCurrency(booking.dailyPrice, booking.currency)],
        ["Tax", formatCurrency(booking.taxAmount, booking.currency)],
        ["Total", formatCurrency(booking.totalPrice, booking.currency)],
      ];
  const personItems: [string, string | null][] = isTransfer
    ? [
        ["Passenger name", `${booking.driverFirstName} ${booking.driverLastName}`],
        ["Email", booking.contactEmail],
        ["Phone", booking.contactPhone],
      ]
    : [
        ["Driver name", `${booking.driverFirstName} ${booking.driverLastName}`],
        ["Birth date", formatDate(booking.driverBirthDate)],
        ["License number", booking.driverLicenseNumber],
        ["Email", booking.contactEmail],
        ["Phone", booking.contactPhone],
      ];

  return <DetailShell><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Booking reference</p><h1 className="mt-3 break-all text-3xl font-semibold tracking-tight sm:text-4xl">{booking.reference}</h1><p className="mt-3 text-muted">Created {formatDateTime(booking.createdAt)}</p></div><div className="flex flex-wrap gap-2"><Badge variant={isTransfer ? "accent" : "neutral"}>{isTransfer ? "Transfer" : "Rental"}</Badge><BookingStatusBadge status={booking.bookingStatus} /><PaymentStatusBadge status={booking.paymentStatus} /></div></div><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-6"><BookingSection title={isTransfer ? "Transfer details" : "Rental details"} icon={<MapPin aria-hidden="true" size={19} />}><Details items={journeyItems} /></BookingSection><BookingSection title={isTransfer ? "Passenger" : "Driver"} icon={<CreditCard aria-hidden="true" size={19} />}><Details items={personItems} /></BookingSection>{booking.specialRequests || booking.cancelReason ? <BookingSection title="Other"><Details items={[["Special requests", booking.specialRequests], ["Cancellation reason", booking.cancelReason]].filter((item): item is [string, string] => Boolean(item[1]))} /></BookingSection> : null}</div><Surface variant="glass" padding="lg" className="h-fit lg:sticky lg:top-6"><p className="text-sm font-semibold">Payment status</p><div className="mt-4"><PaymentControl booking={booking} /></div><p className="mt-4 text-xs leading-5 text-muted">Payment transitions follow the server rules and do not change booking status.</p></Surface></div></DetailShell>;
}
function DetailShell({ children }: { children: React.ReactNode }) { return <PageContainer className="py-8 sm:py-12"><Link href="/admin/bookings" className={buttonStyles({ className: "-ml-3", size: "sm", variant: "ghost" })}><ArrowLeft aria-hidden="true" size={16} /> Back to Bookings</Link><div className="mt-6">{children}</div></PageContainer>; }
function BookingSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) { return <Surface variant="elevated" padding="lg"><h2 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h2><div className="mt-5">{children}</div></Surface>; }
function Details({ items }: { items: [string, string | null][] }) { return <dl className="grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 break-words font-medium">{value ?? "Not provided"}</dd></div>)}</dl>; }
