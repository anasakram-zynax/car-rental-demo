import { CarSearchForm } from "@/features/cars/components/car-search-form";

export default function CarsPage() {
  return (
    <div className="min-h-dvh bg-slate-50/60">
      <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-9 sm:px-6 lg:px-8">
        <CarSearchForm />
      </div>
    </div>
  );
}
