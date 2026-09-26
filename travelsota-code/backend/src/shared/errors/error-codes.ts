import { HttpStatus } from '@nestjs/common';

/**
 * Centralized error codes for the entire application.
 *
 * Convention:
 *   MODULE_AREA_SPECIFIC_ERROR
 *
 * Each entry defines the default HTTP status and a human-readable
 * default message.  Consumers can override the message when a more
 * specific explanation is appropriate.
 */
export const ErrorCodes = {
  // ─── Auth ────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Invalid email or password.',
  },
  AUTH_ACCOUNT_INACTIVE: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Account is not active.',
  },
  AUTH_ACCOUNT_DELETED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Account has been deleted.',
  },
  AUTH_TOKEN_EXPIRED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Invalid or expired refresh token.',
  },
  AUTH_TOKEN_REUSE: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage:
      'Token reuse detected — all sessions revoked. Please log in again.',
  },
  AUTH_EMAIL_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Email already registered.',
  },
  AUTH_ACCOUNT_EXISTS_WITH_PASSWORD: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage:
      'An account with this email already exists. Please sign in with your password.',
  },
  AUTH_REQUIRED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Authentication required.',
  },
  AUTH_INSUFFICIENT_PERMISSIONS: {
    httpStatus: HttpStatus.FORBIDDEN,
    defaultMessage: 'Insufficient permissions.',
  },
  AUTH_USER_NOT_FOUND: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'User not found or inactive.',
  },
  AUTH_INVALID_CURRENT_PASSWORD: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Current password is incorrect.',
  },
  AUTH_PASSWORD_TOO_WEAK: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Password does not meet security requirements.',
  },
  AUTH_PASSWORD_RESET_EXPIRED: {
    httpStatus: HttpStatus.GONE,
    defaultMessage:
      'Password reset link has expired. Please request a new one.',
  },
  AUTH_PASSWORD_RESET_INVALID: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Invalid password reset token.',
  },
  AUTH_PASSWORD_SAME_AS_OLD: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage:
      'New password must be different from your current password.',
  },

  // ─── Flights ──────────────────────────────────────────────────
  FLIGHTS_PROVIDER_DISABLED: {
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    defaultMessage: 'Flights provider is currently disabled by admin.',
  },
  FLIGHTS_PROVIDER_MISCONFIGURED: {
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    defaultMessage: 'Flights provider configuration is incomplete.',
  },
  FLIGHTS_BOOKING_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Flight booking not found.',
  },
  FLIGHTS_BOOKING_CANCELLED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This booking has been cancelled and cannot be modified.',
  },
  FLIGHTS_BOOKING_NOT_CANCELLABLE: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Booking is not in a cancellable state.',
  },
  FLIGHTS_OFFER_PRICE_CHANGED: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage:
      'Offer price has changed. Please rebook at the current price.',
  },
  FLIGHTS_OFFER_EXPIRED: {
    httpStatus: HttpStatus.GONE,
    defaultMessage: 'Offer is no longer available.',
  },
  FLIGHTS_OFFER_UNAVAILABLE: {
    httpStatus: HttpStatus.GONE,
    defaultMessage:
      'The selected fare is no longer available. Please choose another flight.',
  },
  FLIGHTS_OFFER_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Offer not found in cached search results.',
  },
  FLIGHTS_SEARCH_KEY_MISSING: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'A searchKey is required to look up cached search results.',
  },
  FLIGHTS_SEARCH_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Flight search failed. Please try again.',
  },
  FLIGHTS_BOOKING_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Flight booking failed. Please try again.',
  },
  FLIGHTS_ANCILLARY_UNAVAILABLE: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Ancillary service temporarily unavailable.',
  },
  FLIGHTS_SEAT_UNAVAILABLE: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Seat availability service temporarily unavailable.',
  },
  FLIGHTS_SEAT_MAP_UNAVAILABLE: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Seat map preview temporarily unavailable.',
  },
  FLIGHTS_ANCILLARY_CATALOG_UNAVAILABLE: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Ancillary catalog temporarily unavailable.',
  },
  FLIGHTS_ANCILLARY_OPTION_EXPIRED: {
    httpStatus: HttpStatus.GONE,
    defaultMessage: 'Selected ancillary option is no longer available.',
  },
  FLIGHTS_ANCILLARY_REPRICE_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to reprice selected ancillaries.',
  },
  FLIGHTS_SPECIAL_SERVICE_REJECTED: {
    httpStatus: HttpStatus.OK,
    defaultMessage: 'Special service request rejected by airline.',
  },
  FLIGHTS_ANCILLARY_ADD_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to add selected ancillary to booking.',
  },
  FLIGHTS_INVALID_STATUS: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Booking is not in a valid state for this operation.',
  },
  FLIGHTS_OFFER_DETAIL_UNAVAILABLE: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Offer detail is not available from cached search.',
  },

  // ─── Hotels ───────────────────────────────────────────────────
  HOTELS_BOOKING_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Hotel booking not found.',
  },
  HOTELS_BOOKING_CANCELLED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This booking has been cancelled and cannot be modified.',
  },
  HOTELS_BOOKING_NOT_CANCELLABLE: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Booking is not in a cancellable state.',
  },
  HOTELS_RATE_CHECK_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to verify room rate.',
  },
  HOTELS_RATE_PRICE_CHANGED: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Room rate has changed. Please rebook at the current rate.',
  },
  HOTELS_BOOKING_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Hotel booking failed. Please try again.',
  },
  HOTELS_INVALID_STATUS: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Booking is not in a valid state for this operation.',
  },
  HOTELS_CHECKOUT_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Hotel checkout failed. Please try again.',
  },
  HOTELS_CONTENT_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Content or destination not found.',
  },
  HOTELS_CONTENT_DUPLICATE: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Resource already exists.',
  },
  HOTELS_CONTENT_NO_PROVIDER: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'No enabled provider mappings for this destination.',
  },
  HOTELS_CONTENT_INVALID_INPUT: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Invalid input provided.',
  },

  // ─── Payment ──────────────────────────────────────────────────
  PAYMENT_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Payment not found.',
  },
  PAYMENT_GATEWAY_DISABLED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Payment gateway is not enabled.',
  },
  PAYMENT_GATEWAY_UNSUPPORTED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Unsupported payment gateway.',
  },
  GATEWAY_CURRENCY_UNSUPPORTED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This payment gateway does not support the selected currency.',
  },
  PAYMENT_PROVIDER_ID_MISSING: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Provider payment ID is missing.',
  },
  PAYMENT_CONFLICT: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Payment is already being processed.',
  },
  PAYMENT_CAPTURE_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to capture payment.',
  },
  PAYMENT_REFUND_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to refund payment.',
  },
  PAYMENT_CANCELLATION_FAILED: {
    httpStatus: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'Failed to cancel payment.',
  },
  PAYMENT_GATEWAY_NOT_CONFIGURED: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    defaultMessage: 'Payment gateway credentials are not configured.',
  },
  PAYMENT_WEBHOOK_NOT_CONFIGURED: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    defaultMessage: 'Payment webhook secret is not configured.',
  },

  // ─── Access Control / Users / Roles ───────────────────────────
  USER_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'User not found.',
  },
  USER_EMAIL_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Email already registered.',
  },
  USER_CANNOT_DELETE_SUPER_ADMIN: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Cannot delete super admin.',
  },
  USER_CANNOT_DEACTIVATE_SUPER_ADMIN: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Cannot deactivate super admin.',
  },
  ROLE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Role not found.',
  },
  ROLE_ALREADY_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Role already exists.',
  },
  ROLE_PROTECTED: {
    httpStatus: HttpStatus.FORBIDDEN,
    defaultMessage: 'Protected roles can only be modified by Super Admin.',
  },
  ROLE_HAS_USERS: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Cannot delete role: users are assigned to it.',
  },
  ROLE_PERMISSIONS_NOT_FOUND: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'One or more permissions not found.',
  },
  AGENT_PROFILE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Agent profile not found.',
  },
  AGENT_CREDIT_LIMIT_EXCEEDED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Credit limit exceeded.',
  },

  // ─── Settings / Config ────────────────────────────────────────
  CONFIG_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Configuration not found.',
  },
  CONFIG_PROVIDER_UNSUPPORTED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Unsupported provider.',
  },

  // ─── Notifications ────────────────────────────────────────────
  NOTIFICATION_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Notification not found.',
  },
  NOTIFICATION_RULE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Notification rule not found.',
  },
  NOTIFICATION_RULE_ALREADY_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Notification rule already exists.',
  },
  NOTIFICATION_PREFERENCE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Notification preference not found.',
  },

  // ─── Promo Codes ──────────────────────────────────────────────
  PROMO_CODE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Promo code not found.',
  },
  PROMO_CODE_ALREADY_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'A promo code with this code already exists.',
  },
  PROMO_CODE_INVALID: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Invalid promo code.',
  },
  PROMO_CODE_EXPIRED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code has expired.',
  },
  PROMO_CODE_INACTIVE: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code is not active.',
  },
  PROMO_CODE_NOT_PUBLIC: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Invalid promo code.',
  },
  PROMO_CODE_USAGE_LIMIT_REACHED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code has reached its usage limit.',
  },
  PROMO_CODE_PER_USER_LIMIT_REACHED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'You have already used this promo code.',
  },
  PROMO_CODE_MIN_AMOUNT_NOT_MET: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage:
      'Booking amount does not meet the minimum requirement for this promo code.',
  },
  PROMO_CODE_CURRENCY_MISMATCH: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code is not valid for this currency.',
  },
  PROMO_CODE_PRODUCT_NOT_ELIGIBLE: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code is not valid for this product.',
  },
  PROMO_CODE_RESERVATION_EXPIRED: {
    httpStatus: HttpStatus.GONE,
    defaultMessage:
      'Promo code reservation has expired. Please apply the code again.',
  },
  PROMO_CODE_FIRST_BOOKING_ONLY: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This promo code is only valid for first-time bookings.',
  },
  PROMO_CODE_NOT_FOUND_OR_USED: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Invalid promo code.',
  },

  // ─── Blog ────────────────────────────────────────────────────
  BLOG_POST_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Blog post not found.',
  },
  BLOG_CATEGORY_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Blog category not found.',
  },
  BLOG_SLUG_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'A blog post with this slug already exists.',
  },
  BLOG_CATEGORY_SLUG_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'A category with this slug already exists.',
  },
  BLOG_CATEGORY_HAS_POSTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Cannot delete category: posts are assigned to it.',
  },

  // ─── CMS ────────────────────────────────────────────────────
  CMS_PAGE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Page not found.',
  },
  CMS_PAGE_SLUG_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'A page with this slug already exists.',
  },
  CMS_MENU_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Menu item not found.',
  },
  CMS_MENU_INVALID_POSITION: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Invalid menu position.',
  },
  // ─── Demo Leads ───────────────────────────────────────────────
  DEMO_LEADS_DISPOSABLE_EMAIL: {
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    defaultMessage: 'Disposable email addresses are not allowed. Please use a company or personal email.',
  },
  DEMO_LEADS_EMAIL_NOT_VERIFIED: {
    httpStatus: HttpStatus.FORBIDDEN,
    defaultMessage: 'Email not verified. Please verify your email before submitting.',
  },
  DEMO_LEADS_TOKEN_EXPIRED: {
    httpStatus: HttpStatus.GONE,
    defaultMessage: 'Verification link has expired. Please request a new one.',
  },
  DEMO_LEADS_TOKEN_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Verification token not found.',
  },
  DEMO_LEADS_REQUEST_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Demo request not found.',
  },
  DEMO_SESSIONS_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'Demo session not found.',
  },
  DEMO_SESSIONS_INVALID_VISITOR: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Invalid visitor identity.',
  },
  DEMO_LEADS_ALREADY_SUBMITTED: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'This demo request has already been submitted.',
  },
  DEMO_LEADS_MISSING_CONFIG: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    defaultMessage: 'Demo configuration is missing required environment variables.',
  },
  DEMO_RESET_NOT_ENABLED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'Demo reset is not enabled.',
  },
  DEMO_SIGNUP_DISABLED: {
    httpStatus: HttpStatus.FORBIDDEN,
    defaultMessage: 'Public signup is currently disabled.',
  },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/** Extract the error-code definition for a given code string (safe at runtime). */
export function getErrorDefinition(code: string): {
  httpStatus: number;
  defaultMessage: string;
} | null {
  const entry = (
    ErrorCodes as Record<string, { httpStatus: number; defaultMessage: string }>
  )[code];
  return entry ?? null;
}
