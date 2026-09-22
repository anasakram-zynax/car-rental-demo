import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus } from "@/features/cars/types/car.types";

function label(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge variant={status === "confirmed" ? "success" : "neutral"}>{label(status)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const variant = status === "paid" ? "success" : status === "refunded" ? "accent" : "warning";
  return <Badge variant={variant}>{label(status)}</Badge>;
}
