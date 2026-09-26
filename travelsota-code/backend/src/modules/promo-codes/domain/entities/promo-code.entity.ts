import { PromoCodeStatus } from '../enums/promo-code-status.enum';
import { PromoDiscountType } from '../enums/promo-discount-type.enum';
import { PromoCustomerType } from '../enums/promo-customer-type.enum';

export class PromoCodeEntity {
  id!: string;
  code!: string;
  name!: string;
  description?: string | null;
  status!: PromoCodeStatus;
  discountType!: PromoDiscountType;
  discountValueMinor!: number;
  discountPercentBps?: number | null;
  maxDiscountMinor?: number | null;
  minBookingAmountMinor?: number | null;
  currency?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone!: string;
  totalUsageLimit?: number | null;
  perUserLimit?: number | null;
  firstBookingOnly!: boolean;
  customerType!: PromoCustomerType;
  productTypes!: string[];
  eligibleRoutes!: string[];
  eligibleAirlines!: string[];
  eligibleCabins!: string[];
  eligibleHotelIds!: string[];
  eligibleDestinations!: string[];
  excludedProviders!: string[];
  isPublic!: boolean;
  createdById?: string | null;
  updatedById?: string | null;
  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;

  constructor(props: PromoCodeEntity) {
    Object.assign(this, props);
  }

  isActive(): boolean {
    return this.status === PromoCodeStatus.ACTIVE;
  }

  isWithinDateWindow(now: Date = new Date()): boolean {
    if (this.startsAt && now < this.startsAt) return false;
    if (this.endsAt && now > this.endsAt) return false;
    return true;
  }

  matchesCurrency(currency: string): boolean {
    return !this.currency || this.currency.toUpperCase() === currency.toUpperCase();
  }

  matchesProductType(productType: string): boolean {
    return (
      this.productTypes.includes('all') ||
      this.productTypes.includes(productType.toLowerCase())
    );
  }

  normalizeCode(raw: string): string {
    return raw.trim().toUpperCase();
  }
}
