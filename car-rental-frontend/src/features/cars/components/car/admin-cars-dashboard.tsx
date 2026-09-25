"use client";

import {
  AlertCircle,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import {
  useRemoveCar,
  useUpdateCarStatus,
} from "@/features/cars/hooks/use-admin-car-actions";
import { useAdminCars } from "@/features/cars/hooks/use-admin-cars";
import type { Car } from "@/features/cars/types/car.types";
import { formatCurrency } from "@/lib/format";

const PAGE_SIZE = 5;

export function AdminCarsDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = Number(searchParams.get("page"));
  const page = Number.isInteger(value) && value > 0 ? value : 1;
  const { data, error, isLoading, isFetching } = useAdminCars({
    page,
    limit: PAGE_SIZE,
  });
  const removeCar = useRemoveCar();
  const updateCarStatus = useUpdateCarStatus();
  const [carToDeactivate, setCarToDeactivate] = useState<Car | null>(null);
  const actionError = removeCar.error ?? updateCarStatus.error;
  const isUpdating = removeCar.isPending || updateCarStatus.isPending;
  const reactivate = (id: string) =>
    updateCarStatus.mutate({ id, status: "active" });

  function goToPage(nextPage: number) {
    router.push(`${pathname}?page=${nextPage}`, { scroll: false });
  }
  function confirmDeactivate() {
    if (carToDeactivate)
      removeCar.mutate(carToDeactivate.id, {
        onSuccess: () => setCarToDeactivate(null),
      });
  }

  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Fleet management
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Cars
          </h1>
          <p className="mt-3 text-muted">
            Manage all fleet vehicles, including inactive cars.
          </p>
        </div>
        <Link
          href="/admin/cars/new"
          className={buttonStyles({ className: "w-full sm:w-auto" })}
        >
          <Plus aria-hidden="true" size={17} /> Add Car
        </Link>
      </div>
      {actionError ? <ErrorNotice error={actionError} /> : null}
      <Surface
        variant="elevated"
        className="mt-8 overflow-hidden border-white bg-white"
        padding="none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-[#f8fafd] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Fleet inventory</h2>
            <p className="mt-1 text-sm text-muted">
              {data
                ? `${data.total} ${data.total === 1 ? "vehicle" : "vehicles"}`
                : "Loading vehicles..."}
            </p>
          </div>
          {isFetching && !isLoading ? (
            <span className="text-xs font-medium text-muted">Updating…</span>
          ) : null}
        </div>
        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorNotice error={error} className="m-5" /> : null}
        {data && !error ? (
          data.cars.length ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b border-border bg-[#f4f7fb] text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Car</th>
                      <th className="px-4 py-3 font-semibold">Service</th>
                      <th className="px-4 py-3 font-semibold">Vehicle</th>
                      <th className="px-4 py-3 font-semibold">Availability</th>
                      <th className="px-4 py-3 font-semibold">Pricing</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.cars.map((car) => (
                      <CarTableRow
                        key={car.id}
                        car={car}
                        isUpdating={isUpdating}
                        onDeactivate={setCarToDeactivate}
                        onReactivate={reactivate}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-border lg:hidden">
                {data.cars.map((car) => (
                  <CarMobileCard
                    key={car.id}
                    car={car}
                    isUpdating={isUpdating}
                    onDeactivate={setCarToDeactivate}
                    onReactivate={reactivate}
                  />
                ))}
              </div>
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                onPageChange={goToPage}
              />
            </>
          ) : (
            <EmptyState />
          )
        ) : null}
      </Surface>
      {carToDeactivate ? (
        <DeactivateDialog
          car={carToDeactivate}
          isPending={removeCar.isPending}
          onCancel={() => setCarToDeactivate(null)}
          onConfirm={confirmDeactivate}
        />
      ) : null}
    </PageContainer>
  );
}

type CarActionProps = {
  car: Car;
  isUpdating: boolean;
  onDeactivate: (car: Car) => void;
  onReactivate: (id: string) => void;
};
function CarTableRow({
  car,
  isUpdating,
  onDeactivate,
  onReactivate,
}: CarActionProps) {
  return (
    <tr className="align-middle transition-colors hover:bg-blue-50/35">
      <td className="px-6 py-4">
        <CarIdentity car={car} />
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge
            className={
              car.serviceType === "transfer"
                ? "border-blue-200 bg-blue-50 text-accent"
                : undefined
            }
            variant={car.serviceType === "rental" ? "accent" : "neutral"}
          >
            {car.serviceType === "rental" ? "Rental" : "Transfer"}
          </Badge>
          {car.withDriver ? <Badge variant="success">With Driver</Badge> : null}
        </div>
      </td>
      <td className="px-4 py-4 text-muted">
        <p>
          {car.year} · {car.transmission}
        </p>
        <p className="mt-1 text-xs">
          {car.passengers} seats · {car.city}
        </p>
      </td>
      <td className="px-4 py-4">
        <span className="font-semibold">{car.availableQuantity}</span>
        <span className="ml-1 text-xs text-muted">available</span>
      </td>
      <td className="px-4 py-4 font-medium">
        {car.serviceType === "rental" ? (
          <>
            {formatCurrency(car.dailyPrice, car.currency)}
            <span className="block text-xs font-normal text-muted">
              per day
            </span>
          </>
        ) : (
          <>
            {car.transferPackages.length}
            <span className="ml-1 text-xs font-normal text-muted">
              fixed {car.transferPackages.length === 1 ? "route" : "routes"}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={car.status} />
      </td>
      <td className="px-6 py-4">
        <CarActions
          car={car}
          isUpdating={isUpdating}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      </td>
    </tr>
  );
}
function CarMobileCard({
  car,
  isUpdating,
  onDeactivate,
  onReactivate,
}: CarActionProps) {
  return (
    <article className="p-5">
      <CarIdentity car={car} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge
          className={
            car.serviceType === "transfer"
              ? "border-blue-200 bg-blue-50 text-accent"
              : undefined
          }
          variant={car.serviceType === "rental" ? "accent" : "neutral"}
        >
          {car.serviceType === "rental" ? "Rental" : "Transfer"}
        </Badge>
        {car.withDriver ? <Badge variant="success">With Driver</Badge> : null}
        <StatusBadge status={car.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted">Specs</p>
          <p className="mt-1">
            {car.year} · {car.transmission}
          </p>
        </div>
        <div>
          <p className="text-muted">Pricing</p>
          <p className="mt-1 font-medium">
            {car.serviceType === "rental"
              ? `${formatCurrency(car.dailyPrice, car.currency)} / day`
              : `${car.transferPackages.length} fixed ${car.transferPackages.length === 1 ? "route" : "routes"}`}
          </p>
        </div>
        <div>
          <p className="text-muted">Availability</p>
          <p className="mt-1 font-medium">{car.availableQuantity} vehicles</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{car.city}</span>
        <CarActions
          car={car}
          isUpdating={isUpdating}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      </div>
    </article>
  );
}
function CarIdentity({ car }: { car: Car }) {
  const image = car.images.find(({ isDefault }) => isDefault) ?? car.images[0];
  return (
    <div className="flex min-w-0 items-center gap-3">
      {image ? (
        <Image
          src={image.url}
          alt=""
          width={56}
          height={42}
          className="h-12 w-16 shrink-0 rounded-control bg-[#eef2f7] object-contain p-1.5"
        />
      ) : (
        <span className="grid h-11 w-14 shrink-0 place-items-center rounded-control bg-black/[0.045] text-muted">
          <CarFront aria-hidden="true" size={19} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{car.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {car.brand} · {car.city}
        </p>
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: Car["status"] }) {
  return (
    <Badge variant={status === "active" ? "success" : "neutral"}>
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );
}
function CarActions({
  car,
  isUpdating,
  onDeactivate,
  onReactivate,
}: CarActionProps) {
  return (
    <div className="flex justify-end gap-2">
      <Link
        href={`/admin/cars/${car.id}/edit`}
        aria-label={`Edit ${car.name}`}
        className={buttonStyles({ size: "sm", variant: "ghost" })}
      >
        <Pencil aria-hidden="true" size={15} />
        <span className="hidden sm:inline">Edit</span>
      </Link>
      {car.status === "active" ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={isUpdating}
          onClick={() => onDeactivate(car)}
        >
          Deactivate
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={isUpdating}
          onClick={() => onReactivate(car.id)}
        >
          Reactivate
        </Button>
      )}
    </div>
  );
}
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Fleet pagination"
      className="flex items-center justify-between border-t border-border px-5 py-4 sm:px-6"
    >
      <p className="text-sm text-muted">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" size={16} /> Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight aria-hidden="true" size={16} />
        </Button>
      </div>
    </nav>
  );
}
function LoadingState() {
  return (
    <div className="grid min-h-56 place-items-center p-6 text-sm text-muted">
      Loading fleet inventory…
    </div>
  );
}
function EmptyState() {
  return (
    <div className="grid min-h-56 place-items-center p-6 text-center">
      <div>
        <CarFront aria-hidden="true" className="mx-auto text-muted" size={28} />
        <p className="mt-3 font-semibold">No cars found</p>
        <p className="mt-1 text-sm text-muted">
          Add a vehicle when fleet creation is available.
        </p>
      </div>
    </div>
  );
}
function ErrorNotice({
  error,
  className = "mt-6",
}: {
  error: unknown;
  className?: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : "We could not load the fleet inventory.";
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-control border border-red-900/15 bg-red-900/[0.06] px-4 py-3 text-sm text-danger ${className}`}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
      <p>{message}</p>
    </div>
  );
}
function DeactivateDialog({
  car,
  isPending,
  onCancel,
  onConfirm,
}: {
  car: Car;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deactivate-car-title"
        className="w-full max-w-md rounded-card border border-border bg-surface-elevated p-6 shadow-elevated"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="deactivate-car-title" className="text-xl font-semibold">
          Deactivate {car.name}?
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          This removes the car from the public catalog. It remains available in
          this admin list and can be reactivated later.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Deactivating…" : "Deactivate car"}
          </Button>
        </div>
      </div>
    </div>
  );
}
