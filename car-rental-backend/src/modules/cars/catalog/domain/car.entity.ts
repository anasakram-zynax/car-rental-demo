import { CarStatus } from './car-status.js';
import { ServiceType } from './service-type.js';

export interface CarImage {
  id: string;
  url: string;
  isDefault: boolean;
}

export interface CarTransferPackage {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

export interface Car {
  id: string;
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

  serviceType: ServiceType;
  withDriver: boolean;
  availableQuantity: number;

  status: CarStatus;

  images: CarImage[];
  transferPackages: CarTransferPackage[];

  createdAt: Date;
  updatedAt: Date;
}
