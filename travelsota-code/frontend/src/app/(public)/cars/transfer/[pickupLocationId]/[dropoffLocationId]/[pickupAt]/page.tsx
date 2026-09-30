"use client";

import { use } from "react";
import { CarsResultsPage } from "@/features/cars/components/cars-results-page";

export default function TransferCarsResults({
  params,
}: {
  params: Promise<{
    pickupLocationId: string;
    dropoffLocationId: string;
    pickupAt: string;
  }>;
}) {
  const route = use(params);
  return <CarsResultsPage context={{ serviceType: "transfer", ...route }} />;
}
