import { AdminEditCarScreen } from "@/features/cars/components/car/admin-car-editor";

export default async function AdminCarEditPage({ params }: PageProps<"/admin/cars/[id]/edit">) {
  const { id } = await params;
  return <AdminEditCarScreen carId={id} />;
}
