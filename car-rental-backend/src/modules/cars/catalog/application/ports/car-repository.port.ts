import { Car } from '../../domain/car.entity.js';
import { CarStatus } from '../../domain/car-status.js';
import { ServiceType } from '../../domain/service-type.js';

export interface CreateCarTransferPackageData {
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

// ADMIN - SIDE
export interface CreateCarData {
  name: string;
  slug: string;
  brand: string;
  model: string;
  year: number;
  carTypeId: string;
  transmission: string;
  fuelType: string;
  doors: number;
  passengers: number;
  baggage: number;
  amenities: string[];
  city: string;
  dailyPrice: number;
  currency: string;
  isRefundable: boolean;
  featured: boolean;

  serviceType?: ServiceType;
  withDriver?: boolean;
  availableQuantity?: number;

  images: {
    url: string;
    isDefault: boolean;
  }[];

  transferPackages?: CreateCarTransferPackageData[];
}

export type UpdateCarData = Partial<CreateCarData> & {
  status?: CarStatus;
};

export interface CarRepositoryPort {
  create(data: CreateCarData): Promise<Car>;

  findById(id: string): Promise<Car | null>;

  update(id: string, data: UpdateCarData): Promise<Car>;

  setInactive(id: string): Promise<Car>;

  search(filters: SearchCarsFilters): Promise<SearchCarsResult>;

  listAll(filters: PaginationFilters): Promise<SearchCarsResult>;

  findActiveById(id: string): Promise<Car | null>;
}

// PUBLIC - SIDE

export interface SearchCarsFilters {
  city?: string;
  carTypeId?: string;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  limit: number;
}

export interface PaginationFilters {
  page: number;
  limit: number;
}

export interface SearchCarsResult {
  cars: Car[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
