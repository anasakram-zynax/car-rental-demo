export const HotelStaticContentRepoPortToken = Symbol('HotelStaticContentRepoPort');

export interface HotelStaticContentRecord {
  id: string;
  provider: string;
  providerHotelId: string;
  canonicalHotelId: string | null;
  language: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  starRating: number | null;
  images: Record<string, unknown>[] | null;
  amenities: string[] | null;
  descriptions: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertStaticContentInput {
  provider: string;
  providerHotelId: string;
  canonicalHotelId?: string | null;
  language?: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  starRating?: number | null;
  images?: Record<string, unknown>[] | null;
  amenities?: string[] | null;
  descriptions?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface HotelStaticContentRepoPort {
  findByProvider(provider: string, providerHotelId: string, language?: string): Promise<HotelStaticContentRecord | null>;
  findAllByCanonical(canonicalHotelId: string): Promise<HotelStaticContentRecord[]>;
  upsert(input: UpsertStaticContentInput): Promise<HotelStaticContentRecord>;
  deleteByProvider(provider: string): Promise<number>;
}
