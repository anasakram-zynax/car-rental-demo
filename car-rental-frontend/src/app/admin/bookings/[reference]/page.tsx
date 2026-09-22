import { AdminBookingDetail } from "@/features/cars/components/booking/admin-bookings";

export default async function AdminBookingDetailPage({ params }: PageProps<"/admin/bookings/[reference]">) {
  const { reference } = await params;
  return <AdminBookingDetail reference={reference} />;
}
