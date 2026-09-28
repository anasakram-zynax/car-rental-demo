import type {
  CarFleetEntity,
  CreateCarFleetInput,
  UpdateCarFleetInput,
} from '../../domain/entities/car-fleet.entity';

export interface CarFleetListCriteria {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  baseLocation?: string;
  isActive?: boolean;
  rentalEnabled?: boolean;
  transferEnabled?: boolean;
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
  list(criteria: CarFleetListCriteria): Promise<CarFleetListResult>;
  deactivate(id: string): Promise<CarFleetEntity>;
}

export const CarFleetRepositoryPortToken = Symbol('CarFleetRepositoryPort');
