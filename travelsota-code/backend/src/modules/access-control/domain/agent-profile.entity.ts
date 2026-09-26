export type KycStatusType = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AgentProfileEntity {
  id: string;
  userId: string;
  creditLimit: number;
  creditUsed: number;
  commissionRate: number;
  flightMarkup: number;
  hotelMarkup: number;
  companyName: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  taxId: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Phase 1: Agent Hierarchy & Wallet
  parentAgentId: string | null;
  walletBalance: number;
  /** Wallet-domain currency of walletBalance/credit figures. */
  walletCurrency: string;

  // Phase 1: Commission Tier
  commissionTierId: string | null;

  // Phase 1: Pricing & Markups
  markupRules: Record<string, unknown> | null;

  // Phase 1: KYC & Compliance
  kycStatus: KycStatusType;
  kycDocuments: Record<string, unknown>[] | null;

  // Phase 1: White-Label Branding
  branding: Record<string, unknown> | null;

  // Phase 1: Auto-Suspend
  autoSuspendThreshold: number;
  isSuspended: boolean;
  suspensionReason: string | null;

  // Phase 4: RBAC Permission Overrides
  permissionOverrides: { grant?: string[]; revoke?: string[] } | null;

  // Phase 5: Sub-Agent Management
  maxSubAgents: number;
  maxCreditPerSub: number;
  inheritMarkups: boolean;
  inheritCommission: boolean;
  subAgentDefaultRoleId: string | null;
  canManageSubAgents: boolean;
  segregatedCredit: boolean;
  allowedSubAgentRoleIds: string[] | null;

  // Admin control surface: null/empty = all allowed.
  allowedFlightProviders: string[] | null;
  allowedHotelProviders: string[] | null;
  allowedGateways: string[] | null;
}
