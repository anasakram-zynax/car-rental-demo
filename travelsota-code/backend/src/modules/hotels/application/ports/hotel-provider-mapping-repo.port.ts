export const HotelSupplierLinksRepoPortToken = Symbol('HotelSupplierLinksRepoPort');

export interface HotelSupplierLinksRecord {
  id: string;
  canonicalHotelId: string;
  provider: string;
  providerHotelId: string;
  name: string | null;
  normalizedName: string | null;
  addressHash: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  status: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMappingInput {
  canonicalHotelId: string;
  provider: string;
  providerHotelId: string;
  name?: string | null;
  normalizedName?: string | null;
  addressHash?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence?: number | null;
  status?: string;
  payload?: Record<string, unknown> | null;
}

export interface HotelSupplierLinksRepoPort {
  findByProvider(provider: string, providerHotelId: string): Promise<HotelSupplierLinksRecord | null>;
  findByCanonical(canonicalHotelId: string): Promise<HotelSupplierLinksRecord[]>;
  findAllByProvider(provider: string): Promise<HotelSupplierLinksRecord[]>;
  findAllActive(): Promise<HotelSupplierLinksRecord[]>;
  findByProviderHotelIds(provider: string, providerHotelIds: string[]): Promise<HotelSupplierLinksRecord[]>;
  upsert(input: CreateMappingInput): Promise<HotelSupplierLinksRecord>;
}
