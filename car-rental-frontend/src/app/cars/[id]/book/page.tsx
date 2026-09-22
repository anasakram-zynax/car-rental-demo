import type { Metadata } from "next";
import { BookingForm } from "@/features/cars/components/booking/booking-form";

export const metadata: Metadata = {
  title: "Reserve Your Car",
};

export default async function CarBookPage({ params }: PageProps<"/cars/[id]/book">) {
  const { id } = await params;

  return <BookingForm carId={id} />;
}
