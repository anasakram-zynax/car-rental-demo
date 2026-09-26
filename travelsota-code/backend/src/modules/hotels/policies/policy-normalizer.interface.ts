/**
 * Unified cancellation/refund policy types for the hotel policy aggregator.
 *
 * SupplierPolicy — output of each supplier normalizer (Hotelbeds, RateHawk, Amadeus)
 * AggregatedPolicy — output of PolicyAggregatorService (what frontend consumes)
 */

/** A single cancellation policy tier from a supplier. */
export interface PolicyTier {
  /** Cancellation fee amount in supplier currency. */
  amount?: string | number;
  /** ISO datetime deadline — fee applies AFTER this date. */
  from?: string;
  /** Alternative deadline field (some providers use this). */
  deadline?: string;
  /** Policy type annotation (e.g. "CANCELLATION"). */
  policyType?: string;
  /** Percentage-based fee (0-100). */
  percentage?: string | number;
  /** Number-of-nights-based fee. */
  numberOfNights?: number;
}

/**
 * Supplier-level normalized policy.
 * Each supplier normalizer maps raw API data → this shape.
 */
export interface SupplierPolicy {
  /** Whether the rate is fully refundable (all zero fees). */
  refundable: boolean;
  /** Structured cancellation policy tiers. */
  cancellationPolicies: PolicyTier[];
  /** Human-readable cancellation text from the supplier. */
  cancellationPolicyText?: string;
  /** Rate comments (supplier-specific text). */
  rateComments?: string;
  /** Whether modifications are allowed. */
  modificationAllowed?: boolean;
}

/**
 * Aggregated policy — the single shape the frontend consumes.
 * Produced by PolicyAggregatorService from SupplierPolicy.
 */
export interface AggregatedPolicy {
  /** Whether the rate is fully refundable. */
  refundable: boolean;
  /** ISO datetime until which cancellation is free, or null if not free / no deadline. */
  freeCancellationUntil: string | null;
  /** Cancellation fee amount in supplier currency, or null if free. */
  cancellationFee: number | null;
  /** Type of fee: flat amount, percentage, or number of nights. */
  feeType: 'flat' | 'percentage' | 'nights' | null;
  /** Whether the rate allows modifications. */
  modificationAllowed: boolean;
  /** Human-readable policy text for display (e.g. "Free cancellation until Aug 20, 2026"). */
  displayText: string;
  /** Supplier-specific rate comments. */
  rateComments: string;
  /** Original supplier policy data for debugging / edge cases. */
  rawPolicies: PolicyTier[];
  /** Which supplier provided this policy. */
  supplier: string;
}

/** Interface for supplier-specific policy normalizers. */
export interface PolicyNormalizer {
  /** Supplier key (e.g. "hotelbeds", "ratehawk", "amadeus"). */
  readonly supplier: string;

  /**
   * Normalize raw supplier data into SupplierPolicy.
   * @param rawRate - The raw rate object from the supplier API response
   * @returns Normalized SupplierPolicy, or null if no policy data available
   */
  normalize(rawRate: any): SupplierPolicy | null;
}
