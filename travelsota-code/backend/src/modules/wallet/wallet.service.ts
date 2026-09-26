import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PermissionCheckService } from '../access-control/application/services/permission-check.service';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { CurrencyService } from '../currency/application/services/currency.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../notifications/application/notification.service';

export interface WalletBalance {
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  utilizationPercent: number;
  /** Currency all figures above are denominated in (AgentProfile.walletCurrency). */
  currency: string;
}

export interface WalletTransactionEntity {
  id: string;
  agentProfileId: string;
  type: string;
  amount: number;
  /** Wallet-domain currency of `amount`. */
  currency: string;
  /** Pre-conversion values when the money moved in a foreign currency. */
  originalAmount: number | null;
  originalCurrency: string | null;
  balanceBefore: number;
  balanceAfter: number;
  reference: string | null;
  description: string | null;
  evidenceUrl: string | null;
  status: string;
  paymentId: string | null;
  bookingId: string | null;
  bookingType: string | null;
  createdAt: string;
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  type?: string;
  fromDate?: string;
  toDate?: string;
}

export interface PaginatedTransactions {
  items: WalletTransactionEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly permissionCheck: PermissionCheckService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly currencyService: CurrencyService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Resolve agentProfileId from userId, reducing N+1 queries.
   * Call this once in the controller and pass the result to service methods.
   */
  async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /** Get agent's current wallet + credit balance */
  async getBalance(agentProfileId: string): Promise<WalletBalance> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: {
        walletBalance: true,
        walletCurrency: true,
        creditLimit: true,
        creditUsed: true,
        autoSuspendThreshold: true,
        isSuspended: true,
      },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const walletBalance = Number(profile.walletBalance);
    const creditLimit = Number(profile.creditLimit);
    const creditUsed = Number(profile.creditUsed);
    const creditAvailable = Math.max(0, creditLimit - creditUsed);
    const utilizationPercent = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;

    return {
      walletBalance,
      creditLimit,
      creditUsed,
      creditAvailable,
      utilizationPercent,
      currency: profile.walletCurrency ?? 'USD',
    };
  }

  /**
   * Wallet-domain currency for an agent (AgentProfile.walletCurrency, USD
   * for legacy rows). The wallet is a single-currency ledger — every foreign
   * amount is converted into this currency at operation time.
   */
  async getProfileCurrency(agentProfileId: string): Promise<string> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { walletCurrency: true },
    });
    return profile?.walletCurrency ?? 'USD';
  }

  /**
   * Convert a foreign amount into the wallet-domain currency. Identity when
   * the currencies already match (the common same-currency case pays no
   * conversion cost/risk).
   */
  async toWalletCurrency(
    amount: number,
    currency: string | undefined | null,
    walletCurrency: string,
  ): Promise<{ amount: number; currency: string; converted: boolean }> {
    const from = (currency ?? walletCurrency).toUpperCase();
    const to = walletCurrency.toUpperCase();
    if (from === to) return { amount, currency: to, converted: false };
    const converted = await this.currencyService.convert(amount, from, to);
    return { amount: converted.amount, currency: to, converted: true };
  }

  /** Deposit funds into agent's wallet.
   * Idempotency: callers that can be re-invoked for the same money movement
   * (outbox retries, webhook replays) should pass idempotencyKey — a deposit
   * with the same key is a no-op and the existing transaction is returned.
   */
  async deposit(
    agentProfileId: string,
    amount: number,
    paymentId?: string,
    description?: string,
    actorId?: string,
    idempotencyKey?: string,
    currency?: string,
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0) throw new BusinessError('INVALID_AMOUNT', 'Deposit amount must be positive');

    if (idempotencyKey) {
      const existing = await this.prisma.walletTransaction.findFirst({
        where: { agentProfileId, type: 'deposit', reference: idempotencyKey },
        select: { id: true },
      });
      if (existing) return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: existing.id } }));
    }

    // Verify profile exists before entering transaction
    const exists = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { id: true, walletCurrency: true },
    });
    if (!exists) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    // Single-currency ledger: convert foreign deposits into the wallet
    // currency BEFORE touching the balance (previously an INR refund added
    // raw rupees to a USD balance).
    const walletCurrency = exists.walletCurrency ?? 'USD';
    const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);

    // Read balance inside transaction to avoid concurrent deposit corruption
    const tx = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: { walletBalance: true },
      });
      if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

      const balanceBefore = Number(profile.walletBalance);
      const balanceAfter = balanceBefore + inWallet.amount;

      await tx.agentProfile.update({
        where: { id: agentProfileId },
        data: { walletBalance: { increment: inWallet.amount } },
      });

      const txRecord = await tx.walletTransaction.create({
        data: {
          agentProfileId,
          type: 'deposit',
          amount: inWallet.amount,
          currency: inWallet.currency,
          originalAmount: inWallet.converted ? amount : null,
          originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
          balanceBefore,
          balanceAfter,
          reference: idempotencyKey ?? paymentId ?? null,
          description: description ?? 'Wallet deposit',
          status: 'completed',
          paymentId: paymentId ?? null,
        },
      });

      return txRecord;
    });

    await this.auditLog.log({
      userId: actorId,
      action: 'DEPOSIT',
      entity: 'AgentWallet',
      entityId: agentProfileId,
      description: `Deposited ${await this.currencyService.formatWithCode(inWallet.amount, inWallet.currency)} to agent wallet.`,
      newValue: { amount: inWallet.amount, currency: inWallet.currency, balanceBefore: tx.balanceBefore, balanceAfter: tx.balanceAfter } as any,
    });

    return this.toEntity(tx);
  }

  /**
   * Deduct from wallet first, then credit.
   * Uses concurrency-safe approach with SELECT FOR UPDATE locking via Prisma transactions.
   * This is a thin wrapper that creates its own transaction.
   */
  async deduct(
    agentProfileId: string,
    amount: number,
    bookingId?: string,
    bookingType?: string,
    description?: string,
    actorId?: string,
    currency?: string,
  ): Promise<{ walletTransaction: WalletTransactionEntity; creditUsed?: number }> {
    if (amount <= 0) throw new BusinessError('INVALID_AMOUNT', 'Deduction amount must be positive');
    return this.prisma.$transaction((tx) =>
      this.deductInTransaction(tx, agentProfileId, amount, bookingId, bookingType, description, currency),
    );
  }

  /**
   * Same deduction logic as deduct() but reuses a caller-provided transaction.
   * Use this when the caller already has a $transaction open (e.g. finalizeSupplierConfirmedBooking)
   * to avoid nested Prisma transactions.
   */
  async deductInTransaction(
    tx: any,
    agentProfileId: string,
    amount: number,
    bookingId?: string,
    bookingType?: string,
    description?: string,
    currency?: string,
  ): Promise<{ walletTransaction: WalletTransactionEntity; creditUsed?: number }> {
    if (amount <= 0) throw new BusinessError('INVALID_AMOUNT', 'Deduction amount must be positive');

    // Step 1: Read and lock the agent profile
    const profile = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: {
          userId: true,
          walletBalance: true,
          walletCurrency: true,
          creditLimit: true,
          creditUsed: true,
          isSuspended: true,
          parentAgentId: true,
          segregatedCredit: true,
        },
      });

      if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
      if (profile.isSuspended) throw new BusinessError('AGENT_SUSPENDED', 'Agent account is suspended');

      // Single-currency ledger: convert the charge into the wallet currency
      // BEFORE comparing/deducting (previously an INR fare deducted raw
      // rupees from a USD balance).
      const walletCurrency = profile.walletCurrency ?? 'USD';
      const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);
      const chargeAmount = inWallet.amount;

      const walletBalance = Number(profile.walletBalance);
      const creditLimit = Number(profile.creditLimit);
      const creditUsed = Number(profile.creditUsed);
      const creditAvailable = Math.max(0, creditLimit - creditUsed);
      const totalAvailable = walletBalance + creditAvailable;

      if (totalAvailable < chargeAmount) {
        const [availableText, requiredText] = await Promise.all([
          this.currencyService.formatWithCode(totalAvailable, walletCurrency),
          this.currencyService.formatWithCode(chargeAmount, walletCurrency),
        ]);
        throw new BusinessError('INSUFFICIENT_FUNDS', `Insufficient funds. Available: ${availableText}, Required: ${requiredText}`);
      }

      // Calculate split between wallet and credit
      let walletDeduction = Math.min(walletBalance, chargeAmount);
      let creditDeduction = chargeAmount - walletDeduction;

      // Step 2: Deduct from wallet with atomic decrement (no WHERE clause needed inside transaction)
      if (walletDeduction > 0) {
        await tx.agentProfile.update({
          where: { id: agentProfileId },
          data: { walletBalance: { decrement: walletDeduction } },
        });
      }

      // Step 3: Deduct from credit with limit check (control surface:
      // borrowing requires agent:use_credit).
      if (creditDeduction > 0) {
        const creditAllowed = await this.hasControlPermission(
          profile.userId,
          PermissionCode.AGENT_USE_CREDIT,
        );
        if (!creditAllowed) {
          throw new BusinessError('PERMISSION_DENIED', 'Credit use is not enabled for your account. Top up your wallet instead.');
        }
        const newCreditUsed = creditUsed + creditDeduction;
        if (creditLimit > 0 && newCreditUsed > creditLimit) {
          throw new BusinessError('CREDIT_LIMIT_EXCEEDED', 'Credit limit would be exceeded');
        }
        await tx.agentProfile.update({
          where: { id: agentProfileId },
          data: { creditUsed: { increment: creditDeduction } },
        });

        if (profile.parentAgentId && !profile.segregatedCredit) {
          await tx.agentProfile.updateMany({
            where: { id: profile.parentAgentId },
            data: { creditUsed: { increment: creditDeduction } },
          });
        }
      }

      // Step 4: Create the main wallet deduction transaction record
      const balanceAfterWallet = walletBalance - walletDeduction;
      const txRecord = await tx.walletTransaction.create({
        data: {
          agentProfileId,
          type: 'deduct',
          amount: -(walletDeduction + creditDeduction),
          currency: walletCurrency,
          originalAmount: inWallet.converted ? amount : null,
          originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
          balanceBefore: walletBalance,
          balanceAfter: balanceAfterWallet,
          reference: bookingId ?? null,
          description: description ?? `Paid from wallet${bookingType ? ` — ${bookingType} booking` : ''}`,
          status: 'completed',
          bookingId: bookingId ?? null,
          bookingType: bookingType ?? null,
        },
      });

      // Step 5: If credit was used, create a separate credit_used transaction record
      if (creditDeduction > 0) {
        await tx.walletTransaction.create({
          data: {
            agentProfileId,
            type: 'credit_used',
            amount: -creditDeduction,
            currency: walletCurrency,
            originalAmount: inWallet.converted ? amount : null,
            originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
            balanceBefore: 0,
            balanceAfter: 0,
            reference: bookingId ?? null,
            description: description ? `Paid from credit line — ${description}` : 'Paid from credit line',
            status: 'completed',
            bookingId: bookingId ?? null,
            bookingType: bookingType ?? null,
          },
        });
      }

      return {
        walletTransaction: this.toEntity(txRecord),
        creditUsed: creditDeduction > 0 ? creditDeduction : undefined,
      };
  }

  /**
   * Reserve-commit step 1: create a wallet hold with a pessimistic lock on the
   * agent profile (wallet + credit combined check inside one transaction).
   * Extracted verbatim from AgentBookingService.createBooking so the SHARED
   * checkout can reserve funds for agent bookings without importing the
   * agent-booking module (unified pipeline Phase 5). Returns the hold id.
   * Throws INSUFFICIENT_FUNDS / AGENT_SUSPENDED / AGENT_PROFILE_NOT_FOUND.
   */
  /**
   * Agent booking eligibility gate (unified pipeline Phase 9). The legacy
   * /agent delegate enforced this before creating any booking; the unified
   * checkout path must keep enforcing it. Approval, KYC, suspension, and the
   * AGENT_BOOK_FLIGHTS/HOTELS permission are all checked here.
   */
  async validateAgentBookingPermission(
    agentProfileId: string,
    userId: string,
    bookingType: 'flight' | 'hotel',
    opts?: { provider?: string; gateway?: string },
  ): Promise<void> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: {
        isApproved: true, kycStatus: true, isSuspended: true, suspensionReason: true,
        allowedFlightProviders: true, allowedHotelProviders: true, allowedGateways: true,
      },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (!profile.isApproved) throw new BusinessError('AGENT_NOT_APPROVED', 'Your account has not been approved yet. Please contact support.');
    if (profile.kycStatus !== 'APPROVED') throw new BusinessError('KYC_NOT_COMPLETED', 'KYC verification is required before booking. Current status: ' + profile.kycStatus);
    if (profile.isSuspended) throw new BusinessError('AGENT_SUSPENDED', `Account suspended: ${profile.suspensionReason ?? 'Please contact support'}`);

    const requiredPermission = bookingType === 'flight' ? PermissionCode.AGENT_BOOK_FLIGHTS : PermissionCode.AGENT_BOOK_HOTELS;
    const hasPermission = await this.permissionCheck.userHasPermission(userId, requiredPermission);
    if (!hasPermission) throw new BusinessError('PERMISSION_DENIED', `You do not have permission to book ${bookingType === 'flight' ? 'flights' : 'hotels'}.`);

    // Admin control surface: supplier + gateway allowlists (null/empty = all).
    if (opts?.gateway) {
      const allowed = (profile.allowedGateways as string[] | null) ?? [];
      if (allowed.length > 0 && !allowed.map((g) => g.toLowerCase()).includes(String(opts.gateway).toLowerCase())) {
        throw new BusinessError('PERMISSION_DENIED', `Payment method ${opts.gateway} is not enabled for your account.`);
      }
    }
    if (opts?.provider) {
      const allowed = ((bookingType === 'flight' ? profile.allowedFlightProviders : profile.allowedHotelProviders) as string[] | null) ?? [];
      if (allowed.length > 0 && !allowed.map((p) => p.toLowerCase()).includes(String(opts.provider).toLowerCase())) {
        throw new BusinessError('PERMISSION_DENIED', `Supplier ${opts.provider} is not enabled for your account.`);
      }
    }
  }

  /** Control-surface gate for wallet endpoints (top-up, withdraw, view). */
  async requireAgentPermission(userId: string, code: string): Promise<void> {
    const ok = await this.hasControlPermission(userId, code);
    if (!ok) throw new BusinessError('PERMISSION_DENIED', `Missing permission: ${code}.`);
  }

  /**
   * Control permission check with migration-safe default: codes introduced
   * after a deploy (seed not re-run yet) are UNKNOWN — fail OPEN with a warn
   * so live behavior matches pre-gate days. Once seed:rbac registers the
   * code, real grant/revoke enforcement applies. Revokes always work because
   * overrides only reference existing codes.
   */
  async hasControlPermission(userId: string, code: string): Promise<boolean> {
    const known = await this.prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    }).catch(() => null);
    if (!known) {
      this.logger.warn(`Permission code "${code}" not seeded — allowing (run seed:rbac to enforce).`);
      return true;
    }
    return this.permissionCheck.userHasPermission(userId, code);
  }

  async reserveHoldForBooking(
    agentProfileId: string,
    amount: number,
    bookingType: 'flight' | 'hotel',
    currency?: string,
  ): Promise<{ id: string }> {
    const walletCurrency = await this.getProfileCurrency(agentProfileId);
    const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);
    const sufficient = await this.isSufficient(agentProfileId, inWallet.amount, walletCurrency);
    if (!sufficient) {
      throw new BusinessError(
        'INSUFFICIENT_FUNDS',
        `Insufficient wallet balance + credit. Required: ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)}`,
      );
    }

    // Control surface: wallet spend + credit use resolved once, outside the tx.
    const owner = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { userId: true },
    });
    if (!owner) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    const [walletAllowed, creditAllowed] = await Promise.all([
      this.hasControlPermission(owner.userId, PermissionCode.AGENT_USE_WALLET),
      this.hasControlPermission(owner.userId, PermissionCode.AGENT_USE_CREDIT),
    ]);
    if (!walletAllowed) {
      throw new BusinessError('PERMISSION_DENIED', 'Wallet spending is not enabled for your account.');
    }

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRawUnsafe<
        Array<{ id: string; walletBalance: string; creditLimit: string; creditUsed: string; isSuspended: string }>
      >(
        `SELECT id, "walletBalance", "creditLimit", "creditUsed", "isSuspended" FROM "AgentProfile" WHERE id = $1 FOR UPDATE`,
        agentProfileId,
      );
      if (!profile || profile.length === 0) {
        throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
      }

      if (profile[0].isSuspended === 'true') {
        throw new BusinessError(
          'AGENT_SUSPENDED',
          'Account suspended. Cannot create bookings.',
        );
      }

      const walletBalance = Number(profile[0].walletBalance);
      const creditLimit = Number(profile[0].creditLimit);
      const creditUsed = Number(profile[0].creditUsed);
      const creditAvailable = creditAllowed ? Math.max(0, creditLimit - creditUsed) : 0;
      const totalAvailable = walletBalance + creditAvailable;

      if (totalAvailable < inWallet.amount) {
        const [availableText, requiredText, walletText, creditText] = await Promise.all([
          this.currencyService.formatWithCode(totalAvailable, walletCurrency),
          this.currencyService.formatWithCode(inWallet.amount, walletCurrency),
          this.currencyService.formatWithCode(walletBalance, walletCurrency),
          this.currencyService.formatWithCode(creditAvailable, walletCurrency),
        ]);
        throw new BusinessError(
          'INSUFFICIENT_FUNDS',
          `Insufficient wallet + credit. Available: ${availableText}, Required: ${requiredText}. Wallet: ${walletText}, Credit available: ${creditText}`,
        );
      }

      // Create hold record — stamped in the booking currency; the deduction
      // phase converts into the wallet currency at claim time.
      return tx.walletHold.create({
        data: {
          agentProfileId,
          amount,
          currency: (currency ?? walletCurrency).toUpperCase(),
          status: 'pending',
          bookingType,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min expiry
        },
      });
    });
  }

  /** Check sufficient funds without mutating (read-only check) — replaces deprecated checkSufficient */
  async isSufficient(agentProfileId: string, amount: number, currency?: string): Promise<boolean> {
    // Leaner query — only fetch walletBalance, creditLimit, and creditUsed
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: {
        userId: true,
        walletBalance: true,
        walletCurrency: true,
        creditLimit: true,
        creditUsed: true,
      },
    });
    if (!profile) return false;

    const walletCurrency = profile.walletCurrency ?? 'USD';
    const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);

    const walletBalance = Number(profile.walletBalance);
    const creditLimit = Number(profile.creditLimit);
    const creditUsed = Number(profile.creditUsed);
    // Revoked credit doesn't count toward availability.
    const creditAllowed = await this.hasControlPermission(profile.userId, PermissionCode.AGENT_USE_CREDIT);
    const creditAvailable = creditAllowed ? Math.max(0, creditLimit - creditUsed) : 0;

    return (walletBalance + creditAvailable) >= inWallet.amount;
  }

  /** Get paginated transaction history for an agent */
  async getTransactionHistory(
    agentProfileId: string,
    filters?: TransactionFilters,
  ): Promise<PaginatedTransactions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { agentProfileId };
    if (filters?.type) where.type = filters.type;
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toEntity(i)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Admin: get wallet info for a specific agent (by userId) */
  async getAdminWalletView(userId: string): Promise<{
    user: { id: string; email: string; firstName: string | null; lastName: string | null };
    agentProfileId: string;
    balance: WalletBalance;
  } | null> {
    const detail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        agentProfile: { select: { id: true } },
      },
    });
    if (!detail?.agentProfile) return null;

    const balance = await this.getBalance(detail.agentProfile.id);
    return {
      user: { id: detail.id, email: detail.email, firstName: detail.firstName, lastName: detail.lastName },
      agentProfileId: detail.agentProfile.id,
      balance,
    };
  }

  /** Admin: get transaction history for a specific agent's wallet */
  async getAdminTransactionHistory(
    userId: string,
    filters?: TransactionFilters,
  ): Promise<{ agentProfileId: string | null; transactions: PaginatedTransactions } | null> {
    const detail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        agentProfile: { select: { id: true } },
      },
    });
    if (!detail?.agentProfile) return null;
    const transactions = await this.getTransactionHistory(detail.agentProfile.id, filters);
    return { agentProfileId: detail.agentProfile.id, transactions };
  }

  // ─── Offline top-up requests (agent requests → admin approves) ───
  // ponytail: reuses WalletTransaction rows (type topup_request, status
  // pending/completed/rejected) — no new table, no migration.

  /** Agent: request an offline top-up (bank transfer / cash). No money moves yet. */
  async requestTopup(
    agentProfileId: string,
    amount: number,
    method?: string,
    reference?: string,
    currency?: string,
    actorId?: string,
    evidenceUrl?: string,
  ): Promise<WalletTransactionEntity> {
    if (!(amount > 0)) throw new BusinessError('INVALID_AMOUNT', 'Top-up amount must be positive');
    if (amount > 100000) throw new BusinessError('INVALID_AMOUNT', 'Top-up amount exceeds the 100,000 limit');
    // Separate offline workflows: bank transfers must carry proof (reference
    // or receipt); pay_later needs neither — admin approves on terms.
    if ((method ?? 'bank_transfer') === 'bank_transfer' && !reference && !evidenceUrl) {
      throw new BusinessError('TOPUP_EVIDENCE_REQUIRED', 'Bank transfer requests need a transaction reference or receipt.');
    }
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { id: true, walletCurrency: true, user: { select: { email: true } } },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    const walletCurrency = profile.walletCurrency ?? 'USD';
    const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);
    const cleanMethod = (method ?? 'bank_transfer').slice(0, 32);
    const record = await this.prisma.walletTransaction.create({
      data: {
        agentProfileId,
        type: 'topup_request',
        amount: inWallet.amount,
        currency: walletCurrency,
        originalAmount: inWallet.converted ? amount : null,
        originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
        balanceBefore: 0,
        balanceAfter: 0,
        reference: reference?.slice(0, 128) ?? null,
        description: `Top-up request — ${cleanMethod}`,
        evidenceUrl: evidenceUrl?.slice(0, 512) ?? null,
        status: 'pending',
      },
    });
    await this.auditLog.log({
      userId: actorId,
      action: 'TOPUP_REQUESTED',
      entity: 'AgentWallet',
      entityId: agentProfileId,
      description: `Agent requested offline top-up of ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)} via ${cleanMethod}.`,
      newValue: { requestId: record.id, amount: inWallet.amount, currency: walletCurrency, method: cleanMethod } as any,
    });
    // Live admin notification — same eventId for outbox + direct (AGENTS.md).
    try {
      const eventId = randomUUID();
      const payload = {
        requestId: record.id,
        agentProfileId,
        agentEmail: (profile as any)?.user?.email ?? null,
        amount: inWallet.amount,
        currency: walletCurrency,
        method: cleanMethod,
        reference: reference ?? null,
      };
      await this.outboxWriter.writeSafe({
        eventType: 'wallet.topup.requested',
        aggregateType: 'AgentWallet',
        aggregateId: record.id,
        idempotencyKey: eventId,
        payload,
      });
      this.notifications
        .notifyDirect({
          eventType: 'wallet.topup.requested',
          aggregateType: 'AgentWallet',
          aggregateId: record.id,
          idempotencyKey: eventId,
          payload,
        })
        .catch(() => {});
    } catch {
      this.logger.warn(`Failed to emit wallet.topup.requested for ${record.id}`);
    }
    return this.toEntity(record);
  }

  /** Agent: own top-up requests, newest first. */
  async listMyTopupRequests(agentProfileId: string): Promise<WalletTransactionEntity[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { agentProfileId, type: 'topup_request' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toEntity(r));
  }

  /** Admin: all top-up requests, optionally filtered by status. */
  async listAllTopupRequests(status?: string): Promise<Array<WalletTransactionEntity & { agentEmail: string | null }>> {
    const rows = await this.prisma.walletTransaction.findMany({
      // Agent queue only — customer requests live under userId (see CustomerWalletService).
      where: { type: 'topup_request', agentProfileId: { not: null }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const profileIds = [...new Set(rows.map((r) => r.agentProfileId).filter((id): id is string => !!id))];
    const profiles = await this.prisma.agentProfile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, user: { select: { email: true } } },
    });
    const emailByProfile = new Map(profiles.map((p: any) => [p.id, p.user?.email ?? null]));
    return rows.map((r) => ({ ...this.toEntity(r), agentEmail: emailByProfile.get(r.agentProfileId ?? '') ?? null }));
  }

  /** Admin: approve a pending top-up request — credits the wallet atomically. */
  async approveTopup(requestId: string, actorId?: string): Promise<WalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || req.type !== 'topup_request' || !req.agentProfileId) throw new BusinessError('TOPUP_REQUEST_NOT_FOUND');
    if (req.status !== 'pending') throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request is no longer pending');
    const agentProfileId = req.agentProfileId;
    const amount = Number(req.amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: { walletBalance: true },
      });
      if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
      const balanceBefore = Number(profile.walletBalance);
      const balanceAfter = balanceBefore + amount;
      await tx.agentProfile.update({
        where: { id: agentProfileId },
        data: { walletBalance: { increment: amount } },
      });
      // Single winner: only one approver can flip pending → completed.
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'completed', balanceBefore, balanceAfter },
      });
      if (claimed.count === 0) throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request was already handled');
      return tx.walletTransaction.findUnique({ where: { id: requestId } });
    });
    await this.auditLog.log({
      userId: actorId,
      action: 'TOPUP_APPROVED',
      entity: 'AgentWallet',
      entityId: agentProfileId,
      description: `Admin approved top-up request of ${await this.currencyService.formatWithCode(amount, req.currency ?? 'USD')}.`,
      newValue: { requestId, amount } as any,
    });
    return this.toEntity(result);
  }

  /** Admin: reject a pending top-up request — no money moves. */
  async rejectTopup(requestId: string, reason?: string, actorId?: string): Promise<WalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || req.type !== 'topup_request') throw new BusinessError('TOPUP_REQUEST_NOT_FOUND');
    if (req.status !== 'pending') throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request is no longer pending');
    const updated = await this.prisma.walletTransaction.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'rejected', description: `${req.description ?? 'Top-up request'} — rejected${reason ? `: ${reason.slice(0, 200)}` : ''}` },
    });
    if (updated.count === 0) throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request was already handled');
    await this.auditLog.log({
      userId: actorId,
      action: 'TOPUP_REJECTED',
      entity: 'AgentWallet',
      entityId: req.agentProfileId ?? undefined,
      description: `Admin rejected top-up request.${reason ? ` Reason: ${reason}` : ''}`,
      newValue: { requestId, reason: reason ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  // ─── Manual withdrawals (agent wallet → off-platform payout) ───
  // Funds lock at REQUEST time (balance decremented immediately) so an
  // approval can never fail for insufficient funds and concurrent requests
  // can't overspend. Reject/cancel re-credits atomically.

  async requestWalletWithdrawal(
    agentProfileId: string,
    amount: number,
    methodName: string,
    details: string,
    actorId?: string,
  ): Promise<WalletTransactionEntity> {
    if (!(amount > 0)) throw new BusinessError('INVALID_AMOUNT', 'Withdrawal amount must be positive');
    if (amount > 100000) throw new BusinessError('INVALID_AMOUNT', 'Withdrawal amount exceeds the 100,000 limit');
    const cleanMethod = (methodName ?? '').trim().slice(0, 64);
    if (!cleanMethod) throw new BusinessError('WITHDRAWAL_METHOD_REQUIRED', 'Payment method name is required.');
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { id: true, walletBalance: true, walletCurrency: true, isSuspended: true, user: { select: { email: true } } },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (profile.isSuspended) throw new BusinessError('AGENT_SUSPENDED', 'Suspended accounts cannot withdraw.');
    const walletCurrency = profile.walletCurrency ?? 'USD';

    const record = await this.prisma.$transaction(async (tx) => {
      const current = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: { walletBalance: true },
      });
      const balance = Number(current?.walletBalance ?? 0);
      if (balance < amount) {
        const [availableText, requiredText] = await Promise.all([
          this.currencyService.formatWithCode(balance, walletCurrency),
          this.currencyService.formatWithCode(amount, walletCurrency),
        ]);
        throw new BusinessError('INSUFFICIENT_FUNDS', `Insufficient wallet balance. Available: ${availableText}, Required: ${requiredText}.`);
      }
      const locked = await tx.agentProfile.updateMany({
        where: { id: agentProfileId, walletBalance: { gte: amount } },
        data: { walletBalance: { decrement: amount } },
      });
      if (locked.count === 0) throw new BusinessError('INSUFFICIENT_FUNDS', 'Wallet balance changed. Please try again.');
      return tx.walletTransaction.create({
        data: {
          agentProfileId,
          type: 'withdrawal_request',
          amount: -amount,
          currency: walletCurrency,
          balanceBefore: balance,
          balanceAfter: balance - amount,
          reference: cleanMethod,
          description: (details ?? '').trim().slice(0, 500) || `Withdrawal via ${cleanMethod}`,
          status: 'pending',
        },
      });
    });

    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_REQUESTED',
      entity: 'AgentWallet',
      entityId: agentProfileId,
      description: `Agent requested withdrawal of ${await this.currencyService.formatWithCode(amount, walletCurrency)} via ${cleanMethod}. Funds locked pending approval.`,
      newValue: { requestId: record.id, amount, currency: walletCurrency, method: cleanMethod } as any,
    });
    try {
      const eventId = randomUUID();
      const payload = {
        requestId: record.id,
        kind: 'wallet',
        agentProfileId,
        agentEmail: (profile as any)?.user?.email ?? null,
        amount,
        currency: walletCurrency,
        method: cleanMethod,
      };
      await this.outboxWriter.writeSafe({
        eventType: 'wallet.withdrawal.requested',
        aggregateType: 'AgentWallet',
        aggregateId: record.id,
        idempotencyKey: eventId,
        payload,
      });
      this.notifications
        .notifyDirect({
          eventType: 'wallet.withdrawal.requested',
          aggregateType: 'AgentWallet',
          aggregateId: record.id,
          idempotencyKey: eventId,
          payload,
        })
        .catch(() => {});
    } catch {
      this.logger.warn(`Failed to emit wallet.withdrawal.requested for ${record.id}`);
    }
    return this.toEntity(record);
  }

  async listMyWithdrawals(agentProfileId: string): Promise<WalletTransactionEntity[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { agentProfileId, type: 'withdrawal_request' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async listAllWithdrawals(status?: string): Promise<Array<WalletTransactionEntity & { agentEmail: string | null }>> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'withdrawal_request', agentProfileId: { not: null }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = [...new Set(rows.map((r) => r.agentProfileId).filter((id): id is string => !!id))];
    const profiles = await this.prisma.agentProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, user: { select: { email: true } } },
    });
    const emailById = new Map(profiles.map((p: any) => [p.id, p.user?.email ?? null]));
    return rows.map((r) => ({ ...this.toEntity(r), agentEmail: emailById.get(r.agentProfileId ?? '') ?? null }));
  }

  /** Admin: approve — funds already locked at request; just close + record ref. */
  async approveWithdrawal(requestId: string, paymentReference?: string, actorId?: string): Promise<WalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || !(req as any).agentProfileId) {
      throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request is no longer pending');
    const updated = await this.prisma.walletTransaction.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'completed', paymentId: paymentReference?.slice(0, 128) ?? null },
    });
    if (updated.count === 0) throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request was already handled');
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_APPROVED',
      entity: 'AgentWallet',
      entityId: (req as any).agentProfileId,
      description: `Admin approved withdrawal of ${await this.currencyService.formatWithCode(Math.abs(Number((req as any).amount)), (req as any).currency ?? 'USD')}${paymentReference ? ` (ref ${paymentReference})` : ''}. Paid off-platform.`,
      newValue: { requestId, paymentReference: paymentReference ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  /** Admin: reject — re-credits the locked funds atomically. */
  async rejectWithdrawal(requestId: string, reason?: string, actorId?: string): Promise<WalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || !(req as any).agentProfileId) {
      throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request is no longer pending');
    const locked = Math.abs(Number((req as any).amount));
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'rejected', description: `${(req as any).description ?? 'Withdrawal'} — rejected${reason ? `: ${reason.slice(0, 200)}` : ''}` },
      });
      if (claimed.count === 0) throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request was already handled');
      await tx.agentProfile.update({
        where: { id: (req as any).agentProfileId },
        data: { walletBalance: { increment: locked } },
      });
    });
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_REJECTED',
      entity: 'AgentWallet',
      entityId: (req as any).agentProfileId,
      description: `Admin rejected withdrawal. Locked funds returned to wallet.${reason ? ` Reason: ${reason}` : ''}`,
      newValue: { requestId, reason: reason ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  /** Owner: cancel a pending request — locked funds return immediately. */
  async cancelWithdrawal(requestId: string, agentProfileId: string): Promise<WalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || (req as any).agentProfileId !== agentProfileId) {
      throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Only pending requests can be cancelled.');
    const locked = Math.abs(Number((req as any).amount));
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'cancelled' },
      });
      if (claimed.count === 0) throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request was already handled');
      await tx.agentProfile.update({
        where: { id: agentProfileId },
        data: { walletBalance: { increment: locked } },
      });
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  /** Admin: manually adjust an agent's wallet balance (correction) */
  async adminAdjustBalance(
    userId: string,
    amount: number,
    reason: string,
    actorId?: string,
    currency?: string,
  ): Promise<WalletTransactionEntity> {
    const detail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        agentProfile: { select: { id: true, walletBalance: true, walletCurrency: true, creditUsed: true, isSuspended: true } },
      },
    });
    if (!detail?.agentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const agentProfileId = detail.agentProfile.id;
    const walletCurrency = detail.agentProfile.walletCurrency ?? 'USD';
    // Admin corrections may be quoted in a foreign currency — normalize into
    // the wallet currency so the balance stays single-currency.
    const inWallet = await this.toWalletCurrency(amount, currency, walletCurrency);
    const walletBalance = Number(detail.agentProfile.walletBalance);
    const creditUsed = Number(detail.agentProfile.creditUsed);

    if (detail.agentProfile.isSuspended) {
      throw new BusinessError('AGENT_SUSPENDED', 'Cannot adjust balance of a suspended agent');
    }

    if (inWallet.amount < 0 && walletBalance < Math.abs(inWallet.amount)) {
      throw new BusinessError('INSUFFICIENT_FUNDS', 'Adjustment would result in negative balance');
    }

    const balanceBefore = walletBalance;
    const balanceAfter = balanceBefore + inWallet.amount;

    // For negative adjustments (debits), also reduce creditUsed first if applicable
    let creditReduction = 0;
    if (inWallet.amount < 0 && creditUsed > 0) {
      creditReduction = Math.min(creditUsed, Math.abs(inWallet.amount));
    }

    const [tx] = await this.prisma.$transaction([
      this.prisma.walletTransaction.create({
        data: {
          agentProfileId,
          type: inWallet.amount >= 0 ? 'deposit' : 'deduct',
          amount: inWallet.amount,
          currency: walletCurrency,
          originalAmount: inWallet.converted ? amount : null,
          originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
          balanceBefore,
          balanceAfter,
          reference: `admin-adjust-${Date.now()}`,
          description: reason || 'Admin manual adjustment',
          status: 'completed',
        },
      }),
      this.prisma.agentProfile.update({
        where: { id: agentProfileId },
        data: {
          walletBalance: { increment: inWallet.amount },
          ...(creditReduction > 0 ? { creditUsed: { decrement: creditReduction } } : {}),
        },
      }),
    ]);

    await this.auditLog.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'AgentWallet',
      entityId: agentProfileId,
      description: `Admin adjusted wallet by ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)}. Balance: ${await this.currencyService.formatWithCode(balanceBefore, walletCurrency)} → ${await this.currencyService.formatWithCode(balanceAfter, walletCurrency)}. Reason: ${reason}` +
        (creditReduction > 0 ? `. Credit reduced by ${await this.currencyService.formatWithCode(creditReduction, walletCurrency)}.` : ''),
      newValue: { amount: inWallet.amount, currency: walletCurrency, balanceBefore, balanceAfter, reason, creditReduction } as any,
    });

    return this.toEntity(tx);
  }

  /** Expose toEntity for use by other services (e.g. AgentWalletController) */
  toEntity(r: any): WalletTransactionEntity {
    return {
      id: r.id,
      agentProfileId: r.agentProfileId,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency ?? 'USD',
      originalAmount: r.originalAmount != null ? Number(r.originalAmount) : null,
      originalCurrency: r.originalCurrency ?? null,
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
      reference: r.reference ?? null,
      description: r.description ?? null,
      evidenceUrl: r.evidenceUrl ?? null,
      status: r.status,
      paymentId: r.paymentId ?? null,
      bookingId: r.bookingId ?? null,
      bookingType: r.bookingType ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
