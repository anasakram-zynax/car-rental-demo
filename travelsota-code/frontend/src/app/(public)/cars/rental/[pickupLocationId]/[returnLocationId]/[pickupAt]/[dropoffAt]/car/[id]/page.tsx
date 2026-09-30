"use client";

import { use } from "react";
import { CarsContextualDetail } from "@/app/(public)/cars/[id]/page";

export default function RentalCarDetail({
  params,
}: {
  params: Promise<{
    pickupLocationId: string;
    returnLocationId: string;
    pickupAt: string;
    dropoffAt: string;
    id: string;
  }>;
}) {
  const route = use(params);
  return (
    <CarsContextualDetail
      id={route.id}
      context={{ serviceType: "rental", ...route }}
    />
  );
}
