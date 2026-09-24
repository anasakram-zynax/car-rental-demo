"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Car, CreateCarInput, LocalCarImageSelection, ServiceType } from '../../types/car.types';
import type { AdminCarSubmission, AdminCarSaveResult } from '../../hooks/use-save-admin-car';
import { useCarFormOptions } from '../../hooks/use-car-form-options';
import { slugifyCarName } from '../../utils/car-slug';

type PackageRow = { key: string; fromLocation: string; toLocation: string; price: string; currency: string };
const textFields = ['name', 'slug', 'brand', 'model', 'year', 'carTypeId', 'transmission', 'fuelType', 'doors', 'passengers', 'baggage', 'city', 'dailyPrice', 'currency', 'availableQuantity', 'amenities'] as const;
type TextField = typeof textFields[number];
type Values = Record<TextField, string> & { serviceType: ServiceType; withDriver: boolean; isRefundable: boolean; featured: boolean; status: 'active' | 'inactive' };
const control = 'h-11 w-full rounded-control border border-border bg-surface-elevated px-3.5 text-sm outline-none focus:ring-4 focus:ring-[var(--ring)]';
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index);

function initialValues(car?: Car): Values {
  return {
    name: car?.name ?? '', slug: car?.slug ?? '', brand: car?.brand ?? '', model: car?.model ?? '',
    year: car ? String(car.year) : '', carTypeId: car?.carTypeId ?? '', transmission: car?.transmission ?? '', fuelType: car?.fuelType ?? '',
    doors: String(car?.doors ?? 4), passengers: String(car?.passengers ?? 5), baggage: String(car?.baggage ?? 2),
    city: car?.city ?? '', dailyPrice: car ? String(car.dailyPrice) : '', currency: car?.currency ?? 'USD',
    availableQuantity: String(car?.availableQuantity ?? 1), amenities: car?.amenities.join(', ') ?? '',
    serviceType: car?.serviceType ?? 'rental', withDriver: car?.withDriver ?? false,
    isRefundable: car?.isRefundable ?? true, featured: car?.featured ?? false, status: car?.status ?? 'active',
  };
}

export function AdminCarForm({ car, pending, submitLabel, submissionError, onCancel, onSubmit }: {
  car?: Car; pending: boolean; submitLabel: string; submissionError: string | null; onCancel: () => void;
  onSubmit: (submission: AdminCarSubmission) => Promise<AdminCarSaveResult | undefined>;
}) {
  const formOptionsQuery = useCarFormOptions();
  const [values, setValues] = useState(() => initialValues(car));
  const [packages, setPackages] = useState<PackageRow[]>(() => (car?.transferPackages ?? []).map((item) => ({ ...item, key: item.id, price: String(item.price) })));
  const [files, setFiles] = useState<LocalCarImageSelection[]>([]);
  const previews = useRef(new Set<string>());
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [persistedImages, setPersistedImages] = useState(() => car?.images ?? []);
  const [defaultImageId, setDefaultImageId] = useState(car?.images.find((image) => image.isDefault)?.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState('');
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function release(selection: LocalCarImageSelection) {
    URL.revokeObjectURL(selection.previewUrl);
    previews.current.delete(selection.previewUrl);
  }
  function selectFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected);
    if (files.length + incoming.length > 10) { setFileError('Select at most 10 new images per save.'); return; }
    if (incoming.some((file) => file.size === 0 || file.size > 5 * 1024 * 1024)) { setFileError('Each image must be nonempty and at most 5 MB.'); return; }
    setFileError('');
    const selections = incoming.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previews.current.add(previewUrl);
      return { file, previewUrl, isDefault: false };
    });
    setFiles((current) => [...current, ...selections]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || formOptionsQuery.isPending) return;
    const next: Record<string, string> = {};
    for (const field of textFields) {
      if (field === 'amenities' || (field === 'dailyPrice' && values.serviceType === 'transfer')) continue;
      if (!values[field].trim()) next[field] = 'This field is required.';
    }
    for (const [field, min] of [['year', 2000], ['doors', 1], ['passengers', 1], ['baggage', 0], ['availableQuantity', 1]] as const) {
      const value = Number(values[field]);
      if (!values[field].trim() || !Number.isInteger(value) || value < min) next[field] = `Enter a whole number of at least ${min}.`;
    }
    if (Number(values.year) > currentYear) next.year = `Select a year no later than ${currentYear}.`;
    if (values.serviceType === 'rental' && (!values.dailyPrice.trim() || !Number.isFinite(Number(values.dailyPrice)) || Number(values.dailyPrice) < 0)) next.dailyPrice = 'Enter a valid daily price of 0 or more.';
    if (values.serviceType === 'transfer') {
      if (!packages.length) next.packages = 'Transfer cars require at least one package.';
      packages.forEach((row) => {
        if (!row.fromLocation.trim() || !row.toLocation.trim() || !row.currency.trim() || !/^\d+(\.\d{1,2})?$/.test(row.price) || Number(row.price) <= 0 || Number(row.price) > 99999999.99) {
          next[row.key] = 'Enter both locations, a currency, and a positive price with at most two decimals.';
        }
      });
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const input: CreateCarInput = {
      name: values.name.trim(), slug: values.slug.trim(), brand: values.brand.trim(), model: values.model.trim(), year: Number(values.year),
      carTypeId: values.carTypeId.trim(), transmission: values.transmission.trim(), fuelType: values.fuelType.trim(),
      doors: Number(values.doors), passengers: Number(values.passengers), baggage: Number(values.baggage),
      city: values.city.trim(), dailyPrice: values.serviceType === 'rental' ? Number(values.dailyPrice) : car?.dailyPrice ?? 0,
      currency: values.currency.trim().toUpperCase(), amenities: values.amenities.split(',').map((item) => item.trim()).filter(Boolean),
      serviceType: values.serviceType, withDriver: values.withDriver, availableQuantity: Number(values.availableQuantity),
      isRefundable: values.isRefundable, featured: values.featured, images: [],
      ...(values.serviceType === 'transfer' ? { transferPackages: packages.map((row) => ({ fromLocation: row.fromLocation.trim(), toLocation: row.toLocation.trim(), price: Number(row.price), currency: row.currency.trim().toUpperCase() })) } : {}),
    };
    // Omission preserves existing packages when changing to rental.
    const imageFreeInput: Partial<CreateCarInput> = { ...input };
    delete imageFreeInput.images;
    const submission: AdminCarSubmission = {
      input: car ? { ...imageFreeInput, status: values.status } : input,
      files,
      removedImageIds,
      defaultImageId,
    };
    const result = await onSubmit(submission);
    if (result) {
      files.filter((selection) => !result.remainingFiles.includes(selection)).forEach(release);
      setFiles(result.remainingFiles);
      setRemovedImageIds(result.remainingRemovalIds);
      setPersistedImages(result.car.images);
      setDefaultImageId(result.car.images.find((image) => image.isDefault)?.id);
    }
  }

  function field(name: TextField, label: string, type = 'text', min?: number) {
    return <Input key={name} label={label} required={name !== 'amenities'} type={type} min={min} step={name === 'dailyPrice' ? '0.01' : type === 'number' ? '1' : undefined} value={values[name]} error={errors[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />;
  }
  function updateName(name: string) {
    setValues((current) => ({
      ...current,
      name,
      slug: car && name === car.name ? car.slug : slugifyCarName(name),
    }));
  }
  function updatePackage(key: string, name: keyof Omit<PackageRow, 'key'>, value: string) {
    setPackages((current) => current.map((row) => row.key === key ? { ...row, [name]: value } : row));
  }

  const formOptions = formOptionsQuery.data;

  return <form noValidate onSubmit={submit} className="space-y-6">
    {formOptionsQuery.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/20 p-4 text-sm text-danger"><span>Car form options could not be loaded.</span><Button size="sm" variant="secondary" onClick={() => void formOptionsQuery.refetch()}>Retry</Button></div> : null}
    <fieldset disabled={pending || formOptionsQuery.isPending} className="space-y-6">
      <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Basic information</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><Input label="Name" required value={values.name} error={errors.name} onChange={(event) => updateName(event.target.value)} /><Input label="Slug" required readOnly value={values.slug} error={errors.slug} hint="Generated automatically from the car name." />{field('brand', 'Brand')}{field('model', 'Model')}</div></Surface>
      <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Vehicle details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">Year<select required className={control} value={values.year} aria-invalid={Boolean(errors.year)} onChange={(event) => setValues((current) => ({ ...current, year: event.target.value }))}><option value="">Select year</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>{errors.year ? <span className="text-xs text-danger">{errors.year}</span> : null}</label>
        <label className="grid gap-2 text-sm font-medium">Car type<select required className={control} value={values.carTypeId} aria-invalid={Boolean(errors.carTypeId)} onChange={(event) => setValues((current) => ({ ...current, carTypeId: event.target.value }))}><option value="">Select car type</option>{formOptions?.carTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>{errors.carTypeId ? <span className="text-xs text-danger">{errors.carTypeId}</span> : null}</label>
        <Input label="Transmission" required list="car-transmission-options" value={values.transmission} error={errors.transmission} hint="Select a suggestion or enter a new transmission." onChange={(event) => setValues((current) => ({ ...current, transmission: event.target.value }))} /><datalist id="car-transmission-options">{formOptions?.transmissions.map((transmission) => <option key={transmission} value={transmission} />)}</datalist>
        <label className="grid gap-2 text-sm font-medium">Fuel type<select required className={control} value={values.fuelType} aria-invalid={Boolean(errors.fuelType)} onChange={(event) => setValues((current) => ({ ...current, fuelType: event.target.value }))}><option value="">Select fuel type</option>{formOptions?.fuelTypes.map((fuelType) => <option key={fuelType} value={fuelType}>{fuelType}</option>)}</select>{errors.fuelType ? <span className="text-xs text-danger">{errors.fuelType}</span> : null}</label>
        {field('doors', 'Doors', 'number', 1)}{field('passengers', 'Passengers', 'number', 1)}{field('baggage', 'Baggage', 'number', 0)}{field('availableQuantity', 'Available quantity', 'number', 1)}
      </div></Surface>
      <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Service and pricing</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">Service Type<select className={control} value={values.serviceType} onChange={(event) => setValues((current) => ({ ...current, serviceType: event.target.value as ServiceType }))}><option value="rental">Rental</option><option value="transfer">Transfer</option></select></label>
        {field('city', 'City')}{values.serviceType === 'rental' ? field('dailyPrice', 'Daily Price', 'number', 0) : null}{field('currency', 'Currency')}
        {car ? <label className="grid gap-2 text-sm font-medium">Status<select className={control} value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as Values['status'] }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label> : null}
      </div><label className="mt-5 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.withDriver} onChange={(event) => setValues((current) => ({ ...current, withDriver: event.target.checked }))} /> With Driver</label></Surface>
      {values.serviceType === 'transfer' ? <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Transfer Packages</h2><div className="mt-5 space-y-5">{packages.map((row, index) => <fieldset key={row.key} className="rounded-control border border-border p-4"><legend className="px-2 text-sm font-medium">Package {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input label="From Location" required value={row.fromLocation} onChange={(event) => updatePackage(row.key, 'fromLocation', event.target.value)} /><Input label="To Location" required value={row.toLocation} onChange={(event) => updatePackage(row.key, 'toLocation', event.target.value)} /><Input label="Price" required type="number" min="0.01" step="0.01" value={row.price} onChange={(event) => updatePackage(row.key, 'price', event.target.value)} /><Input label="Currency" required value={row.currency} onChange={(event) => updatePackage(row.key, 'currency', event.target.value)} /></div>{errors[row.key] ? <p role="alert" className="mt-2 text-sm text-danger">{errors[row.key]}</p> : null}<Button className="mt-3" variant="ghost" onClick={() => setPackages((current) => current.filter((item) => item.key !== row.key))}>Remove package {index + 1}</Button></fieldset>)}</div>{errors.packages ? <p role="alert" className="mt-3 text-sm text-danger">{errors.packages}</p> : null}<Button className="mt-5" variant="secondary" onClick={() => setPackages((current) => [...current, { key: crypto.randomUUID(), fromLocation: '', toLocation: '', price: '', currency: values.currency }])}>+ Add Package</Button></Surface> : null}
      <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Features</h2><div className="mt-5">{field('amenities', 'Amenities (comma separated)')}</div><div className="mt-5 flex flex-wrap gap-5">{(['isRefundable', 'featured'] as const).map((name) => <label key={name} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.checked }))} />{name === 'isRefundable' ? 'Refundable' : 'Featured'}</label>)}</div></Surface>
      <Surface variant="elevated" padding="lg"><h2 className="text-lg font-semibold">Images</h2><p className="mt-2 text-sm text-muted">JPEG, PNG or WebP, up to 5 MB each and 10 new images per save. Images upload when you save.</p><label className="mt-5 grid gap-2 text-sm font-medium">Select Images<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="max-w-full rounded-control border border-border p-3 focus-visible:ring-4 focus-visible:ring-[var(--ring)]" onChange={(event) => { selectFiles(event.target.files); event.target.value = ''; }} /></label>{fileError ? <p role="alert" className="mt-2 text-sm text-danger">{fileError}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{persistedImages.map((image) => {
          const removed = removedImageIds.includes(image.id);
          return <div key={image.id} className="min-w-0 rounded-control border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={`${values.name || 'Car'} image`} className={`h-28 w-full rounded-control object-cover ${removed ? 'opacity-40' : ''}`} />
            <p className="mt-2 text-xs text-muted">{removed ? 'Will be deleted on save' : image.publicId ? 'Saved image' : 'Legacy image — deletion protected'}</p>
            {!removed ? <label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="default-image" checked={defaultImageId === image.id && !files.some((item) => item.isDefault)} onChange={() => { setDefaultImageId(image.id); setFiles((current) => current.map((item) => ({ ...item, isDefault: false }))); }} />Default image</label> : null}
            <Button size="sm" variant="ghost" disabled={!image.publicId} onClick={() => setRemovedImageIds((current) => removed ? current.filter((id) => id !== image.id) : [...current, image.id])}>{removed ? 'Undo removal' : 'Remove image'}</Button>
          </div>;
        })}{files.map((selection) => <div key={selection.previewUrl} className="min-w-0 rounded-control border border-border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selection.previewUrl} alt={selection.file.name} className="h-28 w-full rounded-control object-cover" /><p className="mt-2 truncate text-xs text-muted">New: {selection.file.name}</p><label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="default-image" checked={selection.isDefault} onChange={() => { setDefaultImageId(undefined); setFiles((current) => current.map((item) => ({ ...item, isDefault: item.previewUrl === selection.previewUrl }))); }} />Default image</label><Button size="sm" variant="ghost" onClick={() => { release(selection); setFiles((current) => current.filter((item) => item !== selection)); }}>Remove selection</Button>
        </div>)}</div>
      </Surface>
    </fieldset>
    {submissionError ? <p role="alert" className="rounded-control border border-danger/20 p-4 text-sm text-danger">{submissionError}</p> : null}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || formOptionsQuery.isPending || formOptionsQuery.isError}>{pending ? 'Saving…' : submitLabel}</Button></div>
  </form>;
}
