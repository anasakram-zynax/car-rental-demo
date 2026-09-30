"use client";

import { use } from "react";
import { CarsResultsPage } from "@/features/cars/components/cars-results-page";

export default function RentalCarsResults({
  params,
}: {
  params: Promise<{
    pickupLocationId: string;
    returnLocationId: string;
    pickupAt: string;
    dropoffAt: string;
  }>;
}) {
  const route = use(params);
  return <CarsResultsPage context={{ serviceType: "rental", ...route }} />;
}
