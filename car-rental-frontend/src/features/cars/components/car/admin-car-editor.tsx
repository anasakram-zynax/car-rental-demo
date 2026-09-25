"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { useAdminCar } from "@/features/cars/hooks/use-admin-car";
import {
  useSaveAdminCar,
  type AdminCarSubmission,
} from "@/features/cars/hooks/use-save-admin-car";
import type { Car } from "@/features/cars/types/car.types";
import { ApiError } from "@/lib/api-client";
import { AdminCarForm } from "./admin-car-form";

function EditorShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <Link
        href="/admin/cars"
        className={buttonStyles({
          className: "-ml-3",
          size: "sm",
          variant: "ghost",
        })}
      >
        <ArrowLeft aria-hidden="true" size={16} /> Back to Cars
      </Link>
      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {title}
        </h1>
      </div>
      <div className="mt-8">{children}</div>
    </PageContainer>
  );
}

function messageFor(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Unable to save this car. Please try again.";
}

export function AdminCreateCarScreen() {
  const router = useRouter();
  const saveCar = useSaveAdminCar();
  const [createdCar, setCreatedCar] = useState<Car>();
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  async function submit(submission: AdminCarSubmission) {
    setSubmissionError(null);
    try {
      const result = await saveCar.mutateAsync({
        ...submission,
        carId: createdCar?.id,
      });
      if (result.warning) {
        setCreatedCar(result.car);
        setSubmissionError(result.warning);
        return result;
      }
      router.push("/admin/cars");
      return result;
    } catch (error) {
      setSubmissionError(messageFor(error));
    }
  }

  return (
    <EditorShell
      eyebrow="Fleet management"
      title={createdCar ? `Edit ${createdCar.name}` : "Add a car"}
    >
      <p className="mb-6 max-w-2xl text-muted">
        Add vehicle details and upload images to the fleet catalog.
      </p>
      <AdminCarForm
        car={createdCar}
        pending={saveCar.isPending}
        submitLabel={createdCar ? "Retry image changes" : "Create car"}
        submissionError={submissionError}
        onCancel={() => router.push("/admin/cars")}
        onSubmit={submit}
      />
    </EditorShell>
  );
}

export function AdminEditCarScreen({ carId }: { carId: string }) {
  const router = useRouter();
  const carQuery = useAdminCar(carId);
  const saveCar = useSaveAdminCar();
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  async function submit(submission: AdminCarSubmission) {
    setSubmissionError(null);
    try {
      const result = await saveCar.mutateAsync({ ...submission, carId });
      if (result.warning) {
        setSubmissionError(result.warning);
        return result;
      }
      router.push("/admin/cars");
      return result;
    } catch (error) {
      setSubmissionError(messageFor(error));
    }
  }

  if (carQuery.isPending)
    return (
      <EditorShell eyebrow="Fleet management" title="Edit car">
        <div className="space-y-5">
          <div className="h-44 animate-pulse rounded-card bg-black/[0.07]" />
          <div className="h-72 animate-pulse rounded-card bg-black/[0.07]" />
        </div>
      </EditorShell>
    );
  if (carQuery.isError || !carQuery.data) {
    const notFound =
      carQuery.error instanceof ApiError && carQuery.error.status === 404;
    return (
      <EditorShell
        eyebrow="Fleet management"
        title={notFound ? "Car not found" : "Unable to load car"}
      >
        <Surface variant="elevated" padding="lg" className="max-w-xl">
          <p className="text-muted">
            {notFound
              ? "This car is no longer available in the admin catalog."
              : "Please check your connection and try again."}
          </p>
          {!notFound ? (
            <Button className="mt-6" onClick={() => void carQuery.refetch()}>
              Try Again
            </Button>
          ) : null}
        </Surface>
      </EditorShell>
    );
  }
  return (
    <EditorShell
      eyebrow="Fleet management"
      title={`Edit ${carQuery.data.name}`}
    >
      <p className="mb-6 max-w-2xl text-muted">
        Update vehicle details, transfer packages, and saved images.
      </p>
      <AdminCarForm
        car={carQuery.data}
        pending={saveCar.isPending}
        submitLabel="Save changes"
        submissionError={submissionError}
        onCancel={() => router.push("/admin/cars")}
        onSubmit={submit}
      />
    </EditorShell>
  );
}
