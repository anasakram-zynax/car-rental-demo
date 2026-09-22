"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Car, CreateCarInput, UpdateCarInput } from "@/features/cars/types/car.types";
import { cn } from "@/lib/cn";

type FormValues = Omit<CreateCarInput, "year" | "doors" | "passengers" | "baggage" | "dailyPrice" | "amenities" | "images"> & {
  year: string;
  doors: string;
  passengers: string;
  baggage: string;
  dailyPrice: string;
  amenities: string;
  imageUrls: string;
  status: "active" | "inactive";
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const emptyValues: FormValues = {
  name: "", slug: "", brand: "", model: "", year: "", carTypeId: "", transmission: "", fuelType: "",
  doors: "4", passengers: "5", baggage: "2", amenities: "", city: "", dailyPrice: "", currency: "USD",
  isRefundable: true, featured: false, imageUrls: "", status: "active",
};

function valuesFromCar(car?: Car): FormValues {
  if (!car) return emptyValues;
  return {
    name: car.name, slug: car.slug, brand: car.brand, model: car.model, year: String(car.year), carTypeId: car.carTypeId,
    transmission: car.transmission, fuelType: car.fuelType, doors: String(car.doors), passengers: String(car.passengers),
    baggage: String(car.baggage), amenities: car.amenities.join(", "), city: car.city, dailyPrice: String(car.dailyPrice),
    currency: car.currency, isRefundable: car.isRefundable, featured: car.featured,
    imageUrls: [
      ...car.images.filter((image) => image.isDefault),
      ...car.images.filter((image) => !image.isDefault),
    ].map((image) => image.url).join("\n"), status: car.status,
  };
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const required: Array<[keyof FormValues, string]> = [
    ["name", "Name is required."], ["slug", "Slug is required."], ["brand", "Brand is required."], ["model", "Model is required."],
    ["year", "Year is required."], ["carTypeId", "Car type ID is required."], ["transmission", "Transmission is required."],
    ["fuelType", "Fuel type is required."], ["doors", "Doors are required."], ["passengers", "Passengers are required."],
    ["baggage", "Baggage capacity is required."], ["city", "City is required."], ["dailyPrice", "Daily price is required."], ["currency", "Currency is required."],
  ];
  required.forEach(([field, message]) => { if (!String(values[field]).trim()) errors[field] = message; });
  const numericRules: Array<[keyof FormValues, number, string]> = [["year", 1900, "Enter a year from 1900 onward."], ["doors", 1, "Enter at least 1."], ["passengers", 1, "Enter at least 1."], ["baggage", 0, "Enter 0 or more."], ["dailyPrice", 0, "Enter 0 or more."]];
  numericRules.forEach(([field, minimum, message]) => { const value = Number(values[field]); if (!Number.isFinite(value) || value < minimum || !Number.isInteger(value) && field !== "dailyPrice") errors[field] = message; });
  const urls = values.imageUrls.split("\n").map((value) => value.trim()).filter(Boolean);
  if (urls.some((url) => { try { new URL(url); return false; } catch { return true; } })) errors.imageUrls = "Each image must be a valid URL.";
  return errors;
}

function toInput(values: FormValues): CreateCarInput {
  const imageUrls = values.imageUrls.split("\n").map((value) => value.trim()).filter(Boolean);
  return {
    name: values.name.trim(), slug: values.slug.trim(), brand: values.brand.trim(), model: values.model.trim(), year: Number(values.year),
    carTypeId: values.carTypeId.trim(), transmission: values.transmission.trim(), fuelType: values.fuelType.trim(), doors: Number(values.doors),
    passengers: Number(values.passengers), baggage: Number(values.baggage), amenities: values.amenities.split(",").map((value) => value.trim()).filter(Boolean),
    city: values.city.trim(), dailyPrice: Number(values.dailyPrice), currency: values.currency.trim().toUpperCase(), isRefundable: values.isRefundable,
    featured: values.featured, images: imageUrls.map((url, index) => ({ url, isDefault: index === 0 })),
  };
}

export function AdminCarForm({ car, pending, submitLabel, submissionError, onCancel, onSubmit }: { car?: Car; pending: boolean; submitLabel: string; submissionError: string | null; onCancel: () => void; onSubmit: (input: CreateCarInput | UpdateCarInput) => Promise<void>; }) {
  const [values, setValues] = useState<FormValues>(() => valuesFromCar(car));
  const [errors, setErrors] = useState<FormErrors>({});
  const isEdit = Boolean(car);
  const update = (field: keyof FormValues, value: FormValues[keyof FormValues]) => { setValues((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined })); };
  const onTextChange = (field: keyof FormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update(field, event.target.value);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (pending) return; const nextErrors = validate(values); setErrors(nextErrors); if (Object.keys(nextErrors).length) return; await onSubmit(isEdit ? { ...toInput(values), status: values.status } : toInput(values)); }
  const selectClassName = "h-11 w-full rounded-control border border-border bg-surface-elevated px-3.5 text-sm shadow-sm outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]";
  const textareaClassName = cn("min-h-24 w-full rounded-control border border-border bg-surface-elevated px-3.5 py-3 text-sm shadow-sm outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]", errors.amenities || errors.imageUrls ? "border-danger" : "");

  return <form noValidate onSubmit={handleSubmit} className="space-y-6"><fieldset disabled={pending} className="space-y-6"><Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Basic information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><Input label="Name" required value={values.name} error={errors.name} onChange={onTextChange("name")} /><Input label="Slug" required value={values.slug} error={errors.slug} hint="Unique URL-friendly identifier." onChange={onTextChange("slug")} /><Input label="Brand" required value={values.brand} error={errors.brand} onChange={onTextChange("brand")} /><Input label="Model" required value={values.model} error={errors.model} onChange={onTextChange("model")} /></div></Surface>
    <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Vehicle details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Input label="Year" required type="number" min="1900" value={values.year} error={errors.year} onChange={onTextChange("year")} /><Input label="Car type ID" required value={values.carTypeId} error={errors.carTypeId} hint="Existing database car-type UUID." onChange={onTextChange("carTypeId")} /><Input label="Transmission" required value={values.transmission} error={errors.transmission} onChange={onTextChange("transmission")} /><Input label="Fuel type" required value={values.fuelType} error={errors.fuelType} onChange={onTextChange("fuelType")} /><Input label="Doors" required type="number" min="1" value={values.doors} error={errors.doors} onChange={onTextChange("doors")} /><Input label="Passengers" required type="number" min="1" value={values.passengers} error={errors.passengers} onChange={onTextChange("passengers")} /><Input label="Baggage" required type="number" min="0" value={values.baggage} error={errors.baggage} onChange={onTextChange("baggage")} /></div></Surface>
    <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Rental information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Input label="City" required value={values.city} error={errors.city} onChange={onTextChange("city")} /><Input label="Daily price" required type="number" min="0" step="0.01" value={values.dailyPrice} error={errors.dailyPrice} onChange={onTextChange("dailyPrice")} /><Input label="Currency" required maxLength={3} value={values.currency} error={errors.currency} onChange={onTextChange("currency")} /></div>{isEdit ? <div className="mt-5 grid gap-2"><label className="text-sm font-medium" htmlFor="car-status">Status</label><select id="car-status" className={selectClassName} value={values.status} onChange={onTextChange("status")}><option value="active">Active</option><option value="inactive">Inactive</option></select></div> : null}</Surface>
    <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Features</h2><div className="mt-5 grid gap-5"><div className="grid gap-2"><label className="text-sm font-medium" htmlFor="amenities">Amenities <span className="text-muted">(comma separated)</span></label><textarea id="amenities" className={textareaClassName} value={values.amenities} onChange={onTextChange("amenities")} /><p className="text-xs text-muted">Leave empty when no amenities apply.</p></div><div className="grid gap-2"><label className="text-sm font-medium" htmlFor="image-urls">Existing image URLs <span className="text-muted">(one per line)</span></label><textarea id="image-urls" className={textareaClassName} value={values.imageUrls} onChange={onTextChange("imageUrls")} /><p className={cn("text-xs text-muted", errors.imageUrls && "text-danger")}>{errors.imageUrls ?? "Uses existing Cloudinary URLs only; the first URL is the default image."}</p></div><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.isRefundable} onChange={(event) => update("isRefundable", event.target.checked)} /> Refundable</label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.featured} onChange={(event) => update("featured", event.target.checked)} /> Featured</label></div></div></Surface></fieldset>
    {submissionError ? <p role="alert" className="rounded-control border border-danger/20 bg-red-900/[0.06] px-4 py-3 text-sm text-danger">{submissionError}</p> : null}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>
  </form>;
}
