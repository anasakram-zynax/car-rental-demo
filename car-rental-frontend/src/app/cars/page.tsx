import type { Metadata } from "next";
import { Suspense } from "react";
import { FadeUp } from "@/components/motion";
import { PageContainer } from "@/components/ui/page-container";
import { CarsCatalog, CarsCatalogFallback } from "@/features/cars";

export const metadata: Metadata = {
  title: "Find a Car",
  description: "Search rental cars and private transfers for your next journey.",
};

export default function CarsPage() {
  return (
    <div className="home-theme min-h-full bg-[#f7faff] text-foreground">
      <PageContainer className="py-8 sm:py-10 lg:py-12">
        <FadeUp className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">Search the fleet</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-[2.75rem]">
            Find the right car for your journey.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
            Compare daily rentals and fixed-route transfers, then refine the results around your trip.
          </p>
        </FadeUp>

        <Suspense fallback={<CarsCatalogFallback />}>
          <CarsCatalog />
        </Suspense>
      </PageContainer>
    </div>
  );
}
