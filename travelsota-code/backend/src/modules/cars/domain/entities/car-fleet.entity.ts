import type { CarLocationEntity } from './car-location.entity';

export interface CarFleetEntity {
  id: string;
  displayName: string;
  normalizedDisplayName: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string | null;
  amenities: string[];
  passengerCapacity: number;
  luggageCapacity: number | null;
  transmission: string | null;
  quantity: number;
  rentalEnabled: boolean;
  transferEnabled: boolean;
  rentalPrice: number | null;
  currency: string;
  locationId: string;
  location: CarLocationEntity;
  images: unknown[] | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCarFleetInput = Omit<
  CarFleetEntity,
  'id' | 'location' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};

export type UpdateCarFleetInput = Partial<
  Omit<CarFleetEntity, 'id' | 'location' | 'createdAt' | 'updatedAt'>
>;
