export interface CarFleetEntity {
  id: string;
  displayName: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string | null;
  passengerCapacity: number;
  luggageCapacity: number | null;
  transmission: string | null;
  quantity: number;
  rentalEnabled: boolean;
  transferEnabled: boolean;
  rentalPriceMinor: number | null;
  transferPriceMinor: number | null;
  currency: string;
  baseLocation: string;
  images: unknown[] | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCarFleetInput = Omit<
  CarFleetEntity,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};

export type UpdateCarFleetInput = Partial<
  Omit<CarFleetEntity, 'id' | 'createdAt' | 'updatedAt'>
>;
