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
    <PageContainer className="py-12 sm:py-16 lg:py-20">
      <FadeUp className="max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
          Search the fleet
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
          Find the right car for the journey.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
          Compare self-drive rentals and private transfers, then refine the
          results around the route and vehicle details that matter to you.
        </p>
      </FadeUp>

      <Suspense fallback={<CarsCatalogFallback />}>
        <CarsCatalog />
      </Suspense>
    </PageContainer>
  );
}
