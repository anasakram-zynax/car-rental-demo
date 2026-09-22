import { Suspense } from "react";
import { AdminCarsDashboard } from "@/features/cars/components/car/admin-cars-dashboard";

export default function AdminCarsPage() {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <AdminCarsDashboard />
    </Suspense>
  );
}
