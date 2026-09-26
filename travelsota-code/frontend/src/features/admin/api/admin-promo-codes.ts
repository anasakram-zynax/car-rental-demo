import { adminRequest } from '@/lib/api/admin-client';

export interface PromoCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValueMinor: number;
  discountPercentBps: number | null;
  maxDiscountMinor: number | null;
  minBookingAmountMinor: number | null;
  currency: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  totalUsageLimit: number | null;
  perUserLimit: number | null;
  firstBookingOnly: boolean;
  customerType: 'ALL' | 'CUSTOMER' | 'AGENT';
  productTypes: string[];
  eligibleRoutes: string[];
  eligibleAirlines: string[];
  eligibleCabins: string[];
  eligibleHotelIds: string[];
  eligibleDestinations: string[];
  excludedProviders: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { redemptions: number };
}

export interface PromoStatsSummary {
  totalCodes: number;
  activeCodes: number;
  totalRedemptions: number;
  totalDiscountMinor: number;
  /** Reporting currency of totalDiscountMinor (backend converts). */
  totalDiscountCurrency: string;
}

export interface PaginatedPromoCodes {
  data: PromoCode[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreatePromoCodeInput {
  code: string;
  name: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValueMinor: number;
  discountPercentBps?: number;
  maxDiscountMinor?: number;
  minBookingAmountMinor?: number;
  currency?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  totalUsageLimit?: number;
  perUserLimit?: number;
  firstBookingOnly?: boolean;
  customerType?: string;
  productTypes?: string[];
  isPublic?: boolean;
  eligibleRoutes?: string[];
  eligibleAirlines?: string[];
}

export type UpdatePromoCodeInput = Partial<CreatePromoCodeInput>;

export function getPromoCodes(filters?: { status?: string; code?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.code) params.set('code', filters.code);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return adminRequest<PaginatedPromoCodes>(`/admin/promo-codes${qs ? `?${qs}` : ''}`);
}

export function getPromoCodeStats() {
  return adminRequest<PromoStatsSummary>('/admin/promo-codes/stats/summary');
}

export function createPromoCode(data: CreatePromoCodeInput) {
  return adminRequest<PromoCode>('/admin/promo-codes', { method: 'POST', body: data });
}

export function updatePromoCode(id: string, data: UpdatePromoCodeInput) {
  return adminRequest<PromoCode>(`/admin/promo-codes/${id}`, { method: 'PATCH', body: data });
}

export function updatePromoCodeStatus(id: string, status: string) {
  return adminRequest<PromoCode>(`/admin/promo-codes/${id}/status`, { method: 'PATCH', body: { status } });
}

export function archivePromoCode(id: string) {
  return adminRequest<void>(`/admin/promo-codes/${id}/archive`, { method: 'POST' });
}

export interface PromoRedemption {
  id: string;
  promoCodeId: string;
  userId: string | null;
  bookingId: string;
  bookingType: string;
  status: string;
  discountMinor: number;
  currency: string;
  bookingSubtotalMinor: number;
  createdAt: string;
  redeemedAt: string | null;
  releasedAt: string | null;
  voidedAt: string | null;
  expiresAt: string | null;
}

export interface PaginatedRedemptions {
  data: PromoRedemption[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PromoAuditLog {
  id: string;
  promoCodeId: string;
  action: string;
  performedBy: string | null;
  details: any;
  createdAt: string;
}

export function getPromoRedemptions(promoCodeId: string, page?: number, limit?: number) {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return adminRequest<PaginatedRedemptions>(`/admin/promo-codes/${promoCodeId}/redemptions${qs ? `?${qs}` : ''}`);
}

export function getPromoAuditLogs(promoCodeId: string) {
  return adminRequest<PromoAuditLog[]>(`/admin/promo-codes/${promoCodeId}/audit`);
}
