import { adminRequest } from '@/lib/api/admin-client';

export interface ManualHotelRoom {
  id: string;
  hotelId: string;
  name: string;
  roomType: string | null;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  basePrice: number;
  currency: string;
  discountPercent: number | null;
  extraBedAvailable: boolean;
  extraBedCharge: number | null;
  breakfastIncluded: boolean;
  cancellationFree: boolean;
  refundable: boolean;
  availableQuantity: number;
  boardType: string | null;
  amenities: string[] | null;
  images: { url: string }[] | null;
  translations: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualHotel {
  id: string;
  name: string;
  slug: string;
  status: string;
  featured: boolean;
  hotelOrder: number;
  stars: number | null;
  rating: number | null;
  accommodationType: string | null;
  description: string | null;
  currency: string;
  discount: number | null;
  refundable: boolean;
  checkinTime: string;
  checkoutTime: string;
  bookingAgeRequirement: number;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  metaTitle: string | null;
  metaKeywords: string | null;
  metaDesc: string | null;
  cancellationPolicy: string | null;
  privacyPolicy: string | null;
  amenities: string[] | null;
  images: { url: string; isDefault?: boolean }[] | null;
  translations: Record<string, unknown> | null;
  destinationCode: string | null;
  destinationName: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  rooms?: ManualHotelRoom[];
  _count?: { rooms: number };
}

export interface ManualHotelListResponse {
  items: ManualHotel[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateManualHotelRoomInput {
  name: string;
  roomType?: string;
  description?: string;
  maxAdults?: number;
  maxChildren?: number;
  basePrice: number;
  currency?: string;
  discountPercent?: number;
  extraBedAvailable?: boolean;
  extraBedCharge?: number;
  breakfastIncluded?: boolean;
  cancellationFree?: boolean;
  refundable?: boolean;
  availableQuantity?: number;
  boardType?: string;
  amenities?: string[];
  images?: { url: string }[];
}

export interface CreateManualHotelInput {
  name: string;
  slug?: string;
  status?: string;
  featured?: boolean;
  hotelOrder?: number;
  stars?: number;
  rating?: number;
  accommodationType?: string;
  description?: string;
  currency?: string;
  discount?: number;
  refundable?: boolean;
  checkinTime?: string;
  checkoutTime?: string;
  bookingAgeRequirement?: number;
  email?: string;
  phone?: string;
  website?: string;
  location: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  metaTitle?: string;
  metaKeywords?: string;
  metaDesc?: string;
  cancellationPolicy?: string;
  privacyPolicy?: string;
  amenities?: string[];
  images?: { url: string; isDefault?: boolean }[];
  destinationCode?: string;
  destinationName?: string;
  rooms: CreateManualHotelRoomInput[];
}

export interface UpdateManualHotelInput {
  name?: string;
  slug?: string;
  status?: string;
  featured?: boolean;
  hotelOrder?: number;
  stars?: number;
  rating?: number;
  accommodationType?: string;
  description?: string;
  currency?: string;
  discount?: number;
  refundable?: boolean;
  checkinTime?: string;
  checkoutTime?: string;
  bookingAgeRequirement?: number;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  metaTitle?: string;
  metaKeywords?: string;
  metaDesc?: string;
  cancellationPolicy?: string;
  privacyPolicy?: string;
  amenities?: string[];
  images?: { url: string; isDefault?: boolean }[];
  destinationCode?: string;
  destinationName?: string;
}

export async function listManualHotels(page = 1, pageSize = 20, search?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search?.trim()) params.set('search', search.trim());
  return adminRequest<ManualHotelListResponse>(`/admin/hotels/manual?${params}`);
}

export async function getManualHotel(id: string) {
  return adminRequest<ManualHotel>(`/admin/hotels/manual/${id}`);
}

export async function createManualHotel(input: CreateManualHotelInput) {
  return adminRequest<ManualHotel>('/admin/hotels/manual', { method: 'POST', body: input });
}

export async function updateManualHotel(id: string, input: UpdateManualHotelInput) {
  return adminRequest<ManualHotel>(`/admin/hotels/manual/${id}`, { method: 'PATCH', body: input });
}

export async function deleteManualHotel(id: string) {
  return adminRequest<ManualHotel>(`/admin/hotels/manual/${id}`, { method: 'DELETE' });
}

export interface UpdateManualHotelRoomInput {
  name?: string;
  roomType?: string;
  description?: string;
  maxAdults?: number;
  maxChildren?: number;
  basePrice?: number;
  currency?: string;
  discountPercent?: number;
  extraBedAvailable?: boolean;
  extraBedCharge?: number;
  breakfastIncluded?: boolean;
  cancellationFree?: boolean;
  refundable?: boolean;
  availableQuantity?: number;
  boardType?: string;
  amenities?: string[];
  images?: { url: string }[];
  status?: string;
}

export async function addRoom(hotelId: string, input: CreateManualHotelRoomInput) {
  return adminRequest<ManualHotelRoom>(`/admin/hotels/manual/${hotelId}/rooms`, { method: 'POST', body: input });
}

export async function updateRoom(roomId: string, input: UpdateManualHotelRoomInput) {
  return adminRequest<ManualHotelRoom>(`/admin/hotels/manual/_/rooms/${roomId}`, { method: 'PATCH', body: input });
}

export async function deleteRoom(roomId: string) {
  return adminRequest<ManualHotelRoom>(`/admin/hotels/manual/_/rooms/${roomId}`, { method: 'DELETE' });
}
