export interface CarLookupTransferPackage {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

export interface CarLookupResult {
  id: string;
  serviceType: 'rental' | 'transfer';
  dailyPrice: number;
  currency: string;
  active: boolean;
  availableQuantity: number;
  transferPackages: CarLookupTransferPackage[];
}

export interface CarLookupPort {
  findById(id: string): Promise<CarLookupResult | null>;
}
