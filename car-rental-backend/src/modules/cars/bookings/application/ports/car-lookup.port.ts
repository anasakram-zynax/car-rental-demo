export interface CarLookupResult {
  id: string;
  dailyPrice: number;
  currency: string;
  active: boolean;
}

export interface CarLookupPort {
  findById(id: string): Promise<CarLookupResult | null>;
}
