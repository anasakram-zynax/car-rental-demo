export type CarSearchMode = "rental" | "transfer";

export interface CarLocation {
  id: string;
  identity: string;
  label: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  type: "airport" | "city" | "area";
  code: string | null;
}

export interface CarImage {
  url: string;
  order: number;
  isDefault: boolean;
}
export interface CarFleet {
  id: string;
  displayName: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string | null;
  amenities: string[];
  passengerCapacity: number;
  luggageCapacity: number | null;
  transmission: string | null;
  images: CarImage[] | null;
  location: CarLocation;
  currency: string;
}
export interface RentalCarResult extends CarFleet {
  serviceType: "rental";
  price: number;
  availability: { isAvailable: boolean; availableQuantity: number };
}
export interface TransferCarResult {
  packageId: string;
  serviceType: "transfer";
  fleet: CarFleet;
  pickupLocation: CarLocation;
  dropoffLocation: CarLocation;
  price: number;
  currency: string;
}
export type CarSearchResult = RentalCarResult | TransferCarResult;
export interface CarSearchResponse {
  items: CarSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface CarSearchQuery {
  serviceType: CarSearchMode;
  locationId?: string;
  pickupLocationId?: string;
  dropoffLocationId?: string;
  pickupAt: string;
  dropoffAt?: string;
  page?: number;
  pageSize?: number;
  minPrice?: number;
  maxPrice?: number;
  transmission?: string;
  passengerCapacity?: number;
  luggageCapacity?: number;
  category?: string;
  sort?: "recommended" | "price_asc" | "price_desc";
}

export type CarCheckoutInput = {
  serviceType: CarSearchMode;
  fleetId?: string;
  transferPackageId?: string;
  pickupLocation: string;
  dropoffLocation?: string;
  pickupAt: string;
  dropoffAt?: string;
  quantity: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gateway: "STRIPE" | "PAYPAL";
  idempotencyKey: string;
  successUrl?: string;
  cancelUrl?: string;
};

export interface CarCheckoutResponse {
  bookingId: string;
  bookingRef: string;
  status: string;
  paymentId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
}
