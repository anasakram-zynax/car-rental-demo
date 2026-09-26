import { redirect } from 'next/navigation';

export default async function OldFlightDetailsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ offerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { offerId } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.set(key, value);
  }

  redirect(`/flights/offers/${encodeURIComponent(offerId)}/details?${qs.toString()}`);
}
