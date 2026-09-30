"use client";

import { use } from "react";
import { CarsContextualDetail } from "@/app/(public)/cars/[id]/page";

export default function TransferCarDetail({
  params,
}: {
  params: Promise<{
    pickupLocationId: string;
    dropoffLocationId: string;
    pickupAt: string;
    id: string;
  }>;
}) {
  const route = use(params);
  return (
    <CarsContextualDetail
      id={route.id}
      context={{ serviceType: "transfer", ...route }}
    />
  );
}
