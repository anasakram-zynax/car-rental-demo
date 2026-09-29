import type {
  CarFleetEntity,
  CreateCarFleetInput,
  UpdateCarFleetInput,
} from '../../domain/entities/car-fleet.entity';
import type { CarServiceType } from '../../domain/types/car-service-type';

export interface CarFleetListCriteria {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  location?: string;
  locationId?: string;
  isActive?: boolean;
  rentalEnabled?: boolean;
  transferEnabled?: boolean;
  serviceType?: CarServiceType;
  passengerCapacity?: number;
  transmission?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface CarFleetListResult {
  items: CarFleetEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CarFleetRepositoryPort {
  create(data: CreateCarFleetInput): Promise<CarFleetEntity>;
  update(id: string, patch: UpdateCarFleetInput): Promise<CarFleetEntity>;
  findById(id: string): Promise<CarFleetEntity | null>;
  findDuplicate(
    normalizedDisplayName: string,
    locationId: string,
    excludeId?: string,
  ): Promise<CarFleetEntity | null>;
  list(criteria: CarFleetListCriteria): Promise<CarFleetListResult>;
  deactivate(id: string): Promise<CarFleetEntity>;
}

export const CarFleetRepositoryPortToken = Symbol('CarFleetRepositoryPort');
