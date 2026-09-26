import { Injectable, Logger } from '@nestjs/common';

/**
 * Severity classification for a Travelport API response.
 * - 'ok': No errors, proceed normally.
 * - 'warning': Errors present but response contains usable data (NDC search with offers+errors).
 * - 'fatal': Errors make the response unusable (abort the workflow).
 * - 'unavailable': Feature-level errors (seat map, ancillary shop) — show "unavailable", don't crash.
 */
export type ErrorSeverity = 'ok' | 'warning' | 'fatal' | 'unavailable';

export interface ErrorClassification {
  severity: ErrorSeverity;
  message?: string;
  reason?: string;
  errors?: unknown[];
}

/**
 * Classifies Travelport API response errors by endpoint context.
 *
 * Different Travelport endpoints have different error semantics:
 * - Search: may return offers + errors (NDC) → warning, not fatal
 * - Price/AddOffer/Commit: any error is fatal
 * - Seat map: errors → show unavailable, don't crash booking
 * - Ancillary shop: errors → show unavailable, no static fallback
 */
@Injectable()
export class TravelportErrorClassifierService {
  private readonly logger = new Logger(TravelportErrorClassifierService.name);

  /**
   * Classify a search response.
   * NDC searches can return offers alongside Result.Error entries.
   * When offers exist, treat errors as warnings — keep the offers.
   * When no offers exist, treat errors as fatal.
   */
  classifySearch(
    offers: unknown[],
    errors: unknown[] | undefined,
  ): ErrorClassification {
    if (!errors || errors.length === 0) {
      return { severity: 'ok' };
    }

    if (offers.length > 0) {
      this.logger.warn(
        `Search returned ${offers.length} offers with ${errors.length} warning(s). Keeping offers with warnings attached.`,
      );
      return {
        severity: 'warning',
        message: `Search returned with ${errors.length} warning(s). Some offers may be unavailable.`,
        errors,
      };
    }

    return {
      severity: 'fatal',
      message: 'Search failed — no offers returned.',
      errors,
    };
  }

  /**
   * Classify a price response. Any error = fatal.
   */
  classifyPrice(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'fatal',
        message: 'Pricing failed.',
        errors,
      };
    }
    return { severity: 'ok' };
  }

  /**
   * Classify an add-offer response. Any error = fatal.
   */
  classifyAddOffer(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'fatal',
        message: 'Add-offer failed.',
        errors,
      };
    }
    return { severity: 'ok' };
  }

  /**
   * Classify a commit response. Any error = fatal.
   */
  classifyCommit(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'fatal',
        message: 'Commit failed.',
        errors,
      };
    }
    return { severity: 'ok' };
  }

  /**
   * Classify a seat map response. Errors = unavailable (don't crash).
   */
  classifySeatMap(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'unavailable',
        message: 'Seat map unavailable from supplier.',
        reason: 'SUPPLIER_ERROR',
        errors,
      };
    }
    return { severity: 'ok' };
  }

  /**
   * Classify an ancillary shop response. Errors = unavailable (no static fallback).
   */
  classifyAncillaryShop(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'unavailable',
        message: 'Extra services unavailable for this booking.',
        reason: 'SUPPLIER_ERROR',
        errors,
      };
    }
    return { severity: 'ok' };
  }

  /**
   * Classify any endpoint response that should treat errors as fatal.
   */
  classifyFatal(errors: unknown[] | undefined): ErrorClassification {
    if (errors && errors.length > 0) {
      return {
        severity: 'fatal',
        message: 'Supplier request failed.',
        errors,
      };
    }
    return { severity: 'ok' };
  }
}
