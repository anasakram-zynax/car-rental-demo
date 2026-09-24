export type CarStatus = "active" | "inactive";
export type ServiceType = "rental" | "transfer";
export type BookingStatus = "confirmed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type CarSearchSort = "price_asc" | "price_desc" | "newest" | "name_asc";

export interface CarImage {
  id: string;
  publicId: string | null;
  url: string;
  isDefault: boolean;
}

export interface CreateCarImageInput {
  url: string;
  isDefault: boolean;
}

export interface LocalCarImageSelection {
  file: File;
  previewUrl: string;
  isDefault: boolean;
}

export interface CarTransferPackage {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

export type BookingTransferPackage = CarTransferPackage;

export interface CreateCarTransferPackageInput {
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

export interface CreateCarInput {
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
  images: CreateCarImageInput[];
  transferPackages?: CreateCarTransferPackageInput[];
}

export interface UpdateCarInput extends Partial<CreateCarInput> {
  status?: CarStatus;
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
  createdAt: string;
  updatedAt: string;
}

export interface CarBooking {
  id: string;
  reference: string;
  carId: string;
  transferPackageId: string | null;
  transferPackage: BookingTransferPackage | null;
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
  driverBirthDate: string | null;
  driverLicenseNumber: string | null;
  contactEmail: string;
  contactPhone: string;
  specialRequests: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateCarBookingBaseInput {
  carId: string;
  pickupAt: string;
  driverFirstName: string;
  driverLastName: string;
  contactEmail: string;
  contactPhone: string;
  specialRequests?: string;
}

export interface CreateRentalBookingInput extends CreateCarBookingBaseInput {
  transferPackageId?: never;
  pickupLocation: string;
  dropoffLocation: string;
  returnAt: string;
  driverBirthDate: string;
  driverLicenseNumber: string;
}

export interface CreateTransferBookingInput extends CreateCarBookingBaseInput {
  transferPackageId: string;
  returnAt?: never;
  pickupLocation?: string;
  dropoffLocation?: string;
  driverBirthDate?: string;
  driverLicenseNumber?: string;
}

export type CreateCarBookingInput =
  | CreateRentalBookingInput
  | CreateTransferBookingInput;

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
  serviceType?: ServiceType;
  city?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  transmission?: string;
  fuelType?: string;
  minBaggage?: number;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: CarSearchSort;
}

export interface CarSearchResult extends PaginationMeta {
  cars: Car[];
}

export interface CarFilterOptions {
  transmissionTypes: string[];
  fuelTypes: string[];
  maxBaggage: number;
  maxPrice: number;
}

export interface CarFormOptions {
  carTypes: Array<{ id: string; label: string }>;
  transmissions: string[];
  fuelTypes: string[];
}
