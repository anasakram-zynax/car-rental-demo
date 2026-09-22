"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { useCreateCar, useUpdateCar } from "@/features/cars/hooks/use-admin-car-actions";
import { useAdminCar } from "@/features/cars/hooks/use-admin-car";
import type { CreateCarInput, UpdateCarInput } from "@/features/cars/types/car.types";
import { ApiError } from "@/lib/api-client";
import { AdminCarForm } from "./admin-car-form";

function EditorShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <PageContainer className="py-8 sm:py-12"><Link href="/admin/cars" className={buttonStyles({ className: "-ml-3", size: "sm", variant: "ghost" })}><ArrowLeft aria-hidden="true" size={16} /> Back to Cars</Link><div className="mt-6"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1></div><div className="mt-8">{children}</div></PageContainer>;
}

function messageFor(error: unknown) { return error instanceof ApiError ? error.message : "Unable to save this car. Please try again."; }

export function AdminCreateCarScreen() {
  const router = useRouter();
  const createCar = useCreateCar();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  async function submit(input: CreateCarInput | UpdateCarInput) { setSubmissionError(null); try { await createCar.mutateAsync(input as CreateCarInput); router.push("/admin/cars"); } catch (error) { setSubmissionError(messageFor(error)); } }
  return <EditorShell eyebrow="Fleet management" title="Add a car"><p className="mb-6 max-w-2xl text-muted">Add vehicle details using the existing catalog data model.</p><AdminCarForm pending={createCar.isPending} submitLabel="Create car" submissionError={submissionError} onCancel={() => router.push("/admin/cars")} onSubmit={submit} /></EditorShell>;
}

export function AdminEditCarScreen({ carId }: { carId: string }) {
  const router = useRouter();
  const carQuery = useAdminCar(carId);
  const updateCar = useUpdateCar();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  async function submit(input: CreateCarInput | UpdateCarInput) { setSubmissionError(null); try { await updateCar.mutateAsync({ id: carId, input: input as UpdateCarInput }); router.push("/admin/cars"); } catch (error) { setSubmissionError(messageFor(error)); } }
  if (carQuery.isPending) return <EditorShell eyebrow="Fleet management" title="Edit car"><div className="space-y-5"><div className="h-44 animate-pulse rounded-card bg-black/[0.07]" /><div className="h-72 animate-pulse rounded-card bg-black/[0.07]" /></div></EditorShell>;
  if (carQuery.isError || !carQuery.data) { const notFound = carQuery.error instanceof ApiError && carQuery.error.status === 404; return <EditorShell eyebrow="Fleet management" title={notFound ? "Car not found" : "Unable to load car"}><Surface variant="elevated" padding="lg" className="max-w-xl"><p className="text-muted">{notFound ? "This car is no longer available in the admin catalog." : "Please check your connection and try again."}</p>{!notFound ? <Button className="mt-6" onClick={() => void carQuery.refetch()}>Try Again</Button> : null}</Surface></EditorShell>; }
  return <EditorShell eyebrow="Fleet management" title={`Edit ${carQuery.data.name}`}><p className="mb-6 max-w-2xl text-muted">Changes are saved directly to the fleet catalog. Existing images are preserved unless their URLs are edited.</p><AdminCarForm car={carQuery.data} pending={updateCar.isPending} submitLabel="Save changes" submissionError={submissionError} onCancel={() => router.push("/admin/cars")} onSubmit={submit} /></EditorShell>;
}
