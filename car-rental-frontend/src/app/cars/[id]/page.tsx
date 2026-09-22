import type { Metadata } from "next";
import { CarDetails } from "@/features/cars/components/car/car-details";

export const metadata: Metadata = {
  title: "Car Details",
};

export default async function CarsDetailPage({
  params,
}: PageProps<"/cars/[id]">) {
  const { id } = await params;

  return <CarDetails carId={id} />;
}
