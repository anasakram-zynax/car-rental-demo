import type { Metadata } from "next";
import { MyBookings } from "@/features/cars/components/booking/my-bookings";

export const metadata: Metadata = {
  title: "My Bookings",
};

export default function MyBookingsPage() {
  return <MyBookings />;
}
