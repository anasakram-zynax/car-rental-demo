// ================================================================
// FRONTEND PERMISSIONS — Must stay in sync with backend
// ================================================================
// Backend source: permission-code.enum.ts
// Seed script: seed-rbac.ts
//
// To add a NEW MODULE:
//   1. Add codes here and to backend permission-code.enum.ts
//   2. Add group to PERMISSION_GROUPS here and backend
//   3. Assign codes to roles in backend seed-rbac.ts → ROLES array
//   4. Run: npm run seed:rbac (backend)
// ================================================================

export const PermissionCode = {
  // Bookings
  BOOKINGS_READ: 'bookings:read',
  BOOKINGS_WRITE: 'bookings:write',
  BOOKINGS_CANCEL: 'bookings:cancel',
  BOOKINGS_REFUND: 'bookings:refund',

  // Users (including Agents management)
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_MANAGE_ROLES: 'users:manage_roles',
  AGENTS_READ: 'agents:read',
  AGENTS_WRITE: 'agents:write',
  AGENTS_SET_CREDIT: 'agents:set_credit',
  AGENTS_SET_COMMISSION: 'agents:set_commission',
  AGENTS_APPROVE: 'agents:approve',

  // Dashboard / Reports
  REPORTS_READ: 'reports:read',
  REPORTS_EXPORT: 'reports:export',

  // Audit Logs
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // Invoices
  INVOICES_READ: 'invoices:read',
  INVOICES_MANAGE: 'invoices:manage',
  INVOICES_EXPORT: 'invoices:export',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  SETTINGS_MANAGE_MODULES: 'settings:manage_modules',
  SETTINGS_MANAGE_PAYMENTS: 'settings:manage_payments',
  SETTINGS_MANAGE_CURRENCIES: 'settings:manage_currencies',
  SETTINGS_MANAGE_LANGUAGES: 'settings:manage_languages',
  SETTINGS_UPDATE_RATES: 'settings:update_rates',
  SETTINGS_MANAGE_SITE: 'settings:manage_site',

  // Customer Markups
  CUSTOMER_MARKUP_READ: 'customer_markup:read',
  CUSTOMER_MARKUP_WRITE: 'customer_markup:write',

  // Promo Codes
  PROMO_CODES_READ: 'promo_codes:read',
  PROMO_CODES_CREATE: 'promo_codes:create',
  PROMO_CODES_UPDATE: 'promo_codes:update',
  PROMO_CODES_DELETE: 'promo_codes:delete',

  // ── Agent Permissions ─────────────────────────────────────
  AGENT_BOOK_FLIGHTS: 'agent:book_flights',
  AGENT_BOOK_HOTELS: 'agent:book_hotels',
  AGENT_VIEW_OWN_BOOKINGS: 'agent:view_own_bookings',
  AGENT_CANCEL_BOOKINGS: 'agent:cancel_bookings',
  AGENT_MODIFY_BOOKINGS: 'agent:modify_bookings',
  AGENT_VIEW_REPORTS: 'agent:view_reports',
  AGENT_EXPORT_REPORTS: 'agent:export_reports',
  AGENT_VIEW_COMMISSION: 'agent:view_commission',
  AGENT_USE_WALLET: 'agent:use_wallet',
  AGENT_VIEW_WALLET: 'agent:view_wallet',
  AGENT_TOPUP_WALLET: 'agent:topup_wallet',
  AGENT_WITHDRAW_FUNDS: 'agent:withdraw_funds',
  AGENT_USE_CREDIT: 'agent:use_credit',
  AGENT_MANAGE_CUSTOMERS: 'agent:manage_customers',
  AGENT_VIEW_PRICING: 'agent:view_pricing',
  AGENT_MANAGE_SUB_AGENTS: 'agent:manage_sub_agents',
  AGENT_ACCESS_INSIGHTS: 'agent:access_insights',

  // ── Supplier Info Visibility (production RBAC) ──────────
  // Only admins/staff can see supplier names, badges, metadata.
  // Agents, customers, and guests never see supplier info.
  SUPPLIER_INFO_VIEW: 'supplier_info:view',

  // ── Notifications ─────────────────────────────────────────
  NOTIFICATIONS_READ: 'notifications:read',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  NOTIFICATIONS_ASSIGN: 'notifications:assign',

  // ── Emails ───────────────────────────────────────────────
  EMAILS_READ: 'emails:read',
  EMAILS_MANAGE: 'emails:manage',
  EMAILS_RETRY: 'emails:retry',

  // ── Blog ─────────────────────────────────────────────────
  BLOGS_READ: 'blogs:read',
  BLOGS_WRITE: 'blogs:write',

  // ── CMS (pages + menus) ──────────────────────────────────
  CMS_READ: 'cms:read',
  CMS_WRITE: 'cms:write',
} as const;

export type PermissionCodeType = (typeof PermissionCode)[keyof typeof PermissionCode];

export interface PermissionGroupDef {
  key: string;
  label: string;
  codes: PermissionCodeType[];
}

// Permission groups are derived strictly from the actual admin sidebar structure.
// Each group maps to a real sidebar module. No legacy/unimplemented groups exist.
export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    codes: [PermissionCode.REPORTS_READ, PermissionCode.REPORTS_EXPORT],
  },
  {
    key: 'bookings',
    label: 'Bookings',
    codes: [PermissionCode.BOOKINGS_READ, PermissionCode.BOOKINGS_WRITE, PermissionCode.BOOKINGS_CANCEL, PermissionCode.BOOKINGS_REFUND],
  },
  {
    key: 'users',
    label: 'Users',
    codes: [
      PermissionCode.USERS_READ,
      PermissionCode.USERS_WRITE,
      PermissionCode.USERS_DELETE,
      PermissionCode.USERS_MANAGE_ROLES,
      PermissionCode.AGENTS_READ,
      PermissionCode.AGENTS_WRITE,
      PermissionCode.AGENTS_SET_CREDIT,
      PermissionCode.AGENTS_SET_COMMISSION,
      PermissionCode.AGENTS_APPROVE,
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    codes: [PermissionCode.INVOICES_READ, PermissionCode.INVOICES_MANAGE, PermissionCode.INVOICES_EXPORT],
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    codes: [PermissionCode.AUDIT_READ, PermissionCode.AUDIT_EXPORT],
  },
  {
    key: 'settings',
    label: 'Settings',
    codes: [PermissionCode.SETTINGS_READ, PermissionCode.SETTINGS_WRITE, PermissionCode.SETTINGS_MANAGE_MODULES, PermissionCode.SETTINGS_MANAGE_PAYMENTS, PermissionCode.SETTINGS_MANAGE_CURRENCIES, PermissionCode.SETTINGS_MANAGE_LANGUAGES, PermissionCode.SETTINGS_UPDATE_RATES, PermissionCode.SETTINGS_MANAGE_SITE],
  },
  // ── Agent Permission Groups ─────────────────────────────────────
  {
    key: 'agent_booking',
    label: 'Agent Booking',
    codes: [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
      PermissionCode.AGENT_CANCEL_BOOKINGS,
      PermissionCode.AGENT_MODIFY_BOOKINGS,
    ],
  },
  {
    key: 'agent_analytics',
    label: 'Agent Analytics',
    codes: [
      PermissionCode.AGENT_VIEW_REPORTS,
      PermissionCode.AGENT_EXPORT_REPORTS,
      PermissionCode.AGENT_ACCESS_INSIGHTS,
    ],
  },
  {
    key: 'agent_finance',
    label: 'Agent Finance',
    codes: [
      PermissionCode.AGENT_VIEW_COMMISSION,
      PermissionCode.AGENT_USE_WALLET,
      PermissionCode.AGENT_VIEW_WALLET,
      PermissionCode.AGENT_TOPUP_WALLET,
      PermissionCode.AGENT_WITHDRAW_FUNDS,
      PermissionCode.AGENT_USE_CREDIT,
    ],
  },
  {
    key: 'agent_crm',
    label: 'Agent CRM',
    codes: [
      PermissionCode.AGENT_MANAGE_CUSTOMERS,
    ],
  },
  {
    key: 'agent_settings',
    label: 'Agent Settings',
    codes: [
      PermissionCode.AGENT_VIEW_PRICING,
    ],
  },
  {
    key: 'agent_team',
    label: 'Agent Team',
    codes: [
      PermissionCode.AGENT_MANAGE_SUB_AGENTS,
    ],
  },
  {
    key: 'customer_markups',
    label: 'Customer Markups',
    codes: [
      PermissionCode.CUSTOMER_MARKUP_READ,
      PermissionCode.CUSTOMER_MARKUP_WRITE,
    ],
  },
  {
    key: 'promo_codes',
    label: 'Promo Codes',
    codes: [
      PermissionCode.PROMO_CODES_READ,
      PermissionCode.PROMO_CODES_CREATE,
      PermissionCode.PROMO_CODES_UPDATE,
      PermissionCode.PROMO_CODES_DELETE,
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    codes: [
      PermissionCode.NOTIFICATIONS_READ,
      PermissionCode.NOTIFICATIONS_MANAGE,
      PermissionCode.NOTIFICATIONS_ASSIGN,
    ],
  },
  {
    key: 'emails',
    label: 'Emails',
    codes: [
      PermissionCode.EMAILS_READ,
      PermissionCode.EMAILS_MANAGE,
      PermissionCode.EMAILS_RETRY,
    ],
  },
  {
    key: 'blogs',
    label: 'Blog',
    codes: [PermissionCode.BLOGS_READ, PermissionCode.BLOGS_WRITE],
  },
  {
    key: 'cms',
    label: 'CMS',
    codes: [PermissionCode.CMS_READ, PermissionCode.CMS_WRITE],
  },
];
