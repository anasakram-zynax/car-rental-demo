import { Badge } from "@/components/ui/badge";
import type {
  BookingStatus,
  PaymentStatus,
} from "@/features/cars/types/car.types";

function label(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge
      className="gap-1.5"
      variant={status === "confirmed" ? "success" : "neutral"}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current opacity-75"
      />
      {label(status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const variant =
    status === "paid"
      ? "success"
      : status === "refunded"
        ? "accent"
        : "warning";
  return (
    <Badge className="gap-1.5" variant={variant}>
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current opacity-75"
      />
      {label(status)}
    </Badge>
  );
}
