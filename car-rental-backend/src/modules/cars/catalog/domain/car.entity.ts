import { CarStatus } from './car-status.js';

export interface CarImage {
  id: string;
  url: string;
  isDefault: boolean;
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

  status: CarStatus;

  images: CarImage[];

  createdAt: Date;
  updatedAt: Date;
}
