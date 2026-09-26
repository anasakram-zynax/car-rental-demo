import { apiRequest } from '@/lib/api/client';

export interface CountryOption {
  /** ISO 3166-1 alpha-2 code, uppercase (e.g. "AE"). */
  code: string;
  name: string;
  /** Country calling code including the leading "+" (e.g. "+971"). */
  dialCode: string;
}

export async function getCountries(): Promise<CountryOption[]> {
  const res = await apiRequest<{ countries: CountryOption[] }>('/settings/countries');
  return res.countries ?? [];
}
