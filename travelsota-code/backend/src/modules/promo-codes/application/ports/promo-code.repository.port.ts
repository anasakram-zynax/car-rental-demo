import { PromoCodeStatus } from '../../domain/enums/promo-code-status.enum';

export interface PromoCodeListFilters {
  status?: PromoCodeStatus;
  code?: string;
  productType?: string;
  customerType?: string;
  startsAt?: Date;
  endsAt?: Date;
  createdById?: string;
  page?: number;
  limit?: number;
}

export interface PromoCodeWithCounts {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: PromoCodeStatus;
  discountType: string;
  discountValueMinor: number;
  discountPercentBps: number | null;
  maxDiscountMinor: number | null;
  minBookingAmountMinor: number | null;
  currency: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  totalUsageLimit: number | null;
  perUserLimit: number | null;
  firstBookingOnly: boolean;
  customerType: string;
  productTypes: string[];
  eligibleRoutes: string[];
  eligibleAirlines: string[];
  eligibleCabins: string[];
  eligibleHotelIds: string[];
  eligibleDestinations: string[];
  excludedProviders: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    redemptions: number;
  };
}

export interface PaginatedPromoCodes {
  data: PromoCodeWithCounts[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PromoRedemptionRecord {
  id: string;
  promoCodeId: string;
  userId: string | null;
  bookingId: string | null;
  bookingType: string | null;
  status: string;
  discountMinor: number;
  currency: string;
  bookingSubtotalMinor: number;
  createdAt: Date;
  redeemedAt: Date | null;
}

export interface PromoStatsSummary {
  totalCodes: number;
  activeCodes: number;
  totalRedemptions: number;
  totalDiscountMinor: number;
  /** Currency totalDiscountMinor is denominated in (converted, not raw). */
  totalDiscountCurrency: string;
  /** Per-currency raw breakdown behind the converted total. */
  byCurrency: Array<{ currency: string; minor: number }>;
  uniqueUsers: number;
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
  startsAt?: Date;
  endsAt?: Date;
  timezone?: string;
  totalUsageLimit?: number;
  perUserLimit?: number;
  firstBookingOnly?: boolean;
  customerType?: 'ALL' | 'CUSTOMER' | 'AGENT';
  productTypes?: string[];
  eligibleRoutes?: string[];
  eligibleAirlines?: string[];
  eligibleCabins?: string[];
  eligibleHotelIds?: string[];
  eligibleDestinations?: string[];
  excludedProviders?: string[];
  isPublic?: boolean;
  createdById?: string;
}

export interface UpdatePromoCodeInput extends Partial<CreatePromoCodeInput> {
  updatedById?: string;
}

export interface PromoAuditLogRecord {
  id: string;
  promoCodeId: string;
  actorId: string | null;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: Date;
}

export interface IPromoCodeRepository {
  findById(id: string): Promise<PromoCodeWithCounts | null>;
  findByCode(code: string): Promise<PromoCodeWithCounts | null>;
  findMany(filters: PromoCodeListFilters): Promise<PaginatedPromoCodes>;
  create(input: CreatePromoCodeInput & { createdById?: string }): Promise<PromoCodeWithCounts>;
  update(id: string, input: UpdatePromoCodeInput): Promise<PromoCodeWithCounts>;
  updateStatus(id: string, status: PromoCodeStatus): Promise<PromoCodeWithCounts>;
  softDelete(id: string): Promise<void>;
  countActiveRedemptions(promoCodeId: string): Promise<number>;
  countUserRedemptions(promoCodeId: string, userId: string): Promise<number>;
  hasUserCompletedBooking(userId: string): Promise<boolean>;
  incrementUsageCount(promoCodeId: string): Promise<void>;
  addUsedBy(promoCodeId: string, userId: string): Promise<void>;
  removeUsedBy(promoCodeId: string, userId: string): Promise<void>;
  getStats(): Promise<PromoStatsSummary>;
  getRedemptions(promoCodeId: string, page: number, limit: number): Promise<{ data: PromoRedemptionRecord[]; total: number; page: number; limit: number; totalPages: number }>;
  getAuditLogs(promoCodeId: string): Promise<PromoAuditLogRecord[]>;
  createAuditLog(promoCodeId: string, actorId: string | null, action: string, beforeJson?: unknown, afterJson?: unknown): Promise<void>;
}

export const PromoCodeRepositoryToken = Symbol('PromoCodeRepository');
