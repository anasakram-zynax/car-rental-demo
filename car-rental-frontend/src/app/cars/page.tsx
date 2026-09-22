import type { Metadata } from "next";
import { Suspense } from "react";
import { FadeUp } from "@/components/motion";
import { PageContainer } from "@/components/ui/page-container";
import { CarsCatalog, CarsCatalogFallback } from "@/features/cars";

export const metadata: Metadata = {
  title: "Browse Cars",
  description: "Explore the Northstar rental fleet and find your next car.",
};

export default function CarsPage() {
  return (
    <PageContainer className="py-12 sm:py-16 lg:py-20">
      <FadeUp className="max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
          The fleet
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
          Find your drive.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          Explore our active collection, refine the daily rate and location,
          then choose the car that fits the journey ahead.
        </p>
      </FadeUp>

      <Suspense fallback={<CarsCatalogFallback />}>
        <CarsCatalog />
      </Suspense>
    </PageContainer>
  );
}
