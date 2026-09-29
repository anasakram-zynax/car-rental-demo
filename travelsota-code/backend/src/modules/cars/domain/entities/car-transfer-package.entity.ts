import type { CarFleetEntity } from './car-fleet.entity';
import type { CarLocationEntity } from './car-location.entity';

export interface CarTransferPackageEntity {
  id: string;
  fleetId: string;
  pickupLocationId: string;
  dropoffLocationId: string;
  price: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  fleet?: CarFleetEntity;
  pickupLocation?: CarLocationEntity;
  dropoffLocation?: CarLocationEntity;
}

export type CreateCarTransferPackageInput = Omit<
  CarTransferPackageEntity,
  | 'id'
  | 'fleet'
  | 'pickupLocation'
  | 'dropoffLocation'
  | 'createdAt'
  | 'updatedAt'
> & { id?: string };

export type UpdateCarTransferPackageInput = Partial<
  Omit<
    CarTransferPackageEntity,
    | 'id'
    | 'fleet'
    | 'pickupLocation'
    | 'dropoffLocation'
    | 'createdAt'
    | 'updatedAt'
  >
>;
