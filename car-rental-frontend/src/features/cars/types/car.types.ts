export type CarStatus = "active" | "inactive";
export type BookingStatus = "confirmed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

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
  createdAt: string;
  updatedAt: string;
}

export interface CarBooking {
  id: string;
  reference: string;
  carId: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupAt: string;
  returnAt: string;
  rentalDays: number;
  dailyPrice: number;
  taxAmount: number;
  totalPrice: number;
  currency: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  cancelReason: string | null;
  driverFirstName: string;
  driverLastName: string;
  driverBirthDate: string;
  driverLicenseNumber: string;
  contactEmail: string;
  contactPhone: string;
  specialRequests: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends PaginationMeta {
  items: T[];
}

export interface SearchCarsParams extends PaginationParams {
  city?: string;
  carTypeId?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface CarSearchResult extends PaginationMeta {
  cars: Car[];
}
