import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { CurrencyService } from '../currency/application/services/currency.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../notifications/application/notification.service';
import type {
  PaginatedTransactions,
  TransactionFilters,
  WalletBalance,
} from './wallet.service';

export interface CustomerWalletTransactionEntity {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
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

/**
 * Prepaid customer wallet on the unified ledger (WalletTransaction /
 * WalletHold rows owned by userId). No credit line, no commission —
 * customers spend prepaid funds only, via the same reserve-commit
 * hold pattern as agent wallets.
 */
@Injectable()
export class CustomerWalletService {
  private readonly logger = new Logger(CustomerWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly currencyService: CurrencyService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  async getProfileCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletCurrency: true },
    });
    return (user as any)?.walletCurrency ?? 'USD';
  }

  async toUserCurrency(
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

  /** Current prepaid balance (no credit for customers). */
  async getBalance(userId: string): Promise<WalletBalance> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true, walletCurrency: true },
    });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    const walletBalance = Number((user as any).walletBalance ?? 0);
    return {
      walletBalance,
      creditLimit: 0,
      creditUsed: 0,
      creditAvailable: 0,
      utilizationPercent: 0,
      currency: (user as any).walletCurrency ?? 'USD',
    };
  }

  async isSufficient(userId: string, amount: number, currency?: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true, walletCurrency: true },
    });
    if (!user) return false;
    const walletCurrency = (user as any).walletCurrency ?? 'USD';
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);
    return Number((user as any).walletBalance ?? 0) >= inWallet.amount;
  }

  /** Deposit prepaid funds. Same idempotency contract as the agent deposit. */
  async deposit(
    userId: string,
    amount: number,
    paymentId?: string,
    description?: string,
    actorId?: string,
    idempotencyKey?: string,
    currency?: string,
  ): Promise<CustomerWalletTransactionEntity> {
    if (amount <= 0) throw new BusinessError('INVALID_AMOUNT', 'Deposit amount must be positive');

    if (idempotencyKey) {
      const existing = await this.prisma.walletTransaction.findFirst({
        where: { userId, type: 'deposit', reference: idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: existing.id } }));
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, walletCurrency: true },
    });
    if (!user) throw new BusinessError('USER_NOT_FOUND');

    const walletCurrency = (user as any).walletCurrency ?? 'USD';
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);

    const tx = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });
      if (!current) throw new BusinessError('USER_NOT_FOUND');

      const balanceBefore = Number((current as any).walletBalance ?? 0);
      const balanceAfter = balanceBefore + inWallet.amount;

      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: inWallet.amount } } as any,
      });

      return tx.walletTransaction.create({
        data: {
          userId,
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
        } as any,
      });
    });

    await this.auditLog.log({
      userId: actorId,
      action: 'DEPOSIT',
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Deposited ${await this.currencyService.formatWithCode(inWallet.amount, inWallet.currency)} to customer wallet.`,
      newValue: { amount: inWallet.amount, currency: inWallet.currency, balanceBefore: tx.balanceBefore, balanceAfter: tx.balanceAfter } as any,
    });

    return this.toEntity(tx);
  }

  /** Reserve a hold under row lock. Prepaid only — no credit fallback. */
  async reserveHoldForBooking(
    userId: string,
    amount: number,
    bookingType: 'flight' | 'hotel',
    currency?: string,
  ): Promise<{ id: string }> {
    const walletCurrency = await this.getProfileCurrency(userId);
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);
    const sufficient = await this.isSufficient(userId, inWallet.amount, walletCurrency);
    if (!sufficient) {
      throw new BusinessError(
        'INSUFFICIENT_FUNDS',
        `Insufficient wallet balance. Required: ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; walletBalance: string }>>(
        `SELECT id, "walletBalance" FROM "User" WHERE id = $1 FOR UPDATE`,
        userId,
      );
      if (!rows || rows.length === 0) throw new BusinessError('USER_NOT_FOUND');

      const walletBalance = Number(rows[0].walletBalance ?? 0);
      if (walletBalance < inWallet.amount) {
        const [availableText, requiredText] = await Promise.all([
          this.currencyService.formatWithCode(walletBalance, walletCurrency),
          this.currencyService.formatWithCode(inWallet.amount, walletCurrency),
        ]);
        throw new BusinessError(
          'INSUFFICIENT_FUNDS',
          `Insufficient wallet balance. Available: ${availableText}, Required: ${requiredText}.`,
        );
      }

      return (tx as any).walletHold.create({
        data: {
          userId,
          amount,
          currency: (currency ?? walletCurrency).toUpperCase(),
          status: 'pending',
          bookingType,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    });
  }

  /** Deduct inside a caller-owned transaction (supplier-confirmed finalizer). */
  async deductInTransaction(
    tx: any,
    userId: string,
    amount: number,
    bookingId?: string,
    bookingType?: string,
    description?: string,
    currency?: string,
  ): Promise<{ walletTransaction: CustomerWalletTransactionEntity }> {
    if (amount <= 0) throw new BusinessError('INVALID_AMOUNT', 'Deduction amount must be positive');

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true, walletCurrency: true },
    });
    if (!user) throw new BusinessError('USER_NOT_FOUND');

    const walletCurrency = user.walletCurrency ?? 'USD';
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);
    const walletBalance = Number(user.walletBalance ?? 0);

    if (walletBalance < inWallet.amount) {
      const [availableText, requiredText] = await Promise.all([
        this.currencyService.formatWithCode(walletBalance, walletCurrency),
        this.currencyService.formatWithCode(inWallet.amount, walletCurrency),
      ]);
      throw new BusinessError('INSUFFICIENT_FUNDS', `Insufficient funds. Available: ${availableText}, Required: ${requiredText}`);
    }

    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: inWallet.amount } },
    });

    const txRecord = await tx.walletTransaction.create({
      data: {
        userId,
        type: 'deduct',
        amount: -inWallet.amount,
        currency: walletCurrency,
        originalAmount: inWallet.converted ? amount : null,
        originalCurrency: inWallet.converted && currency ? currency.toUpperCase() : null,
        balanceBefore: walletBalance,
        balanceAfter: walletBalance - inWallet.amount,
        reference: bookingId ?? null,
        description: description ?? `Paid from wallet${bookingType ? ` — ${bookingType} booking` : ''}`,
        status: 'completed',
        bookingId: bookingId ?? null,
        bookingType: bookingType ?? null,
      },
    });

    return { walletTransaction: this.toEntity(txRecord) };
  }

  async getTransactionHistory(userId: string, filters?: TransactionFilters): Promise<PaginatedTransactions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (filters?.type) where.type = filters.type;
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toEntity(i) as any),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Offline top-up requests (customer requests → admin approves) ───

  async requestTopup(
    userId: string,
    amount: number,
    method?: string,
    reference?: string,
    currency?: string,
    evidenceUrl?: string,
  ): Promise<CustomerWalletTransactionEntity> {
    if (!(amount > 0)) throw new BusinessError('INVALID_AMOUNT', 'Top-up amount must be positive');
    if (amount > 100000) throw new BusinessError('INVALID_AMOUNT', 'Top-up amount exceeds the 100,000 limit');
    if ((method ?? 'bank_transfer') === 'bank_transfer' && !reference && !evidenceUrl) {
      throw new BusinessError('TOPUP_EVIDENCE_REQUIRED', 'Bank transfer requests need a transaction reference or receipt.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    const walletCurrency = await this.getProfileCurrency(userId);
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);
    const cleanMethod = (method ?? 'bank_transfer').slice(0, 32);
    const record = await this.prisma.walletTransaction.create({
      data: {
        userId,
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
      } as any,
    });
    await this.auditLog.log({
      userId,
      action: 'TOPUP_REQUESTED',
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Customer requested offline top-up of ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)} via ${cleanMethod}.`,
      newValue: { requestId: record.id, amount: inWallet.amount, currency: walletCurrency, method: cleanMethod } as any,
    });
    try {
      const eventId = randomUUID();
      const payload = {
        requestId: record.id,
        userId,
        customerEmail: (user as any)?.email ?? null,
        amount: inWallet.amount,
        currency: walletCurrency,
        method: cleanMethod,
        reference: reference ?? null,
      };
      await this.outboxWriter.writeSafe({
        eventType: 'wallet.topup.requested',
        aggregateType: 'CustomerWallet',
        aggregateId: record.id,
        idempotencyKey: eventId,
        payload,
      });
      this.notifications
        .notifyDirect({
          eventType: 'wallet.topup.requested',
          aggregateType: 'CustomerWallet',
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

  async listMyTopupRequests(userId: string): Promise<CustomerWalletTransactionEntity[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { userId, type: 'topup_request' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async listAllTopupRequests(status?: string): Promise<Array<CustomerWalletTransactionEntity & { customerEmail: string | null }>> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'topup_request', userId: { not: null }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = [...new Set(rows.map((r) => (r as any).userId).filter(Boolean))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ ...this.toEntity(r), customerEmail: emailById.get((r as any).userId) ?? null }));
  }

  async approveTopup(requestId: string, actorId?: string): Promise<CustomerWalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'topup_request' || !(req as any).userId) {
      throw new BusinessError('TOPUP_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request is no longer pending');
    const userId = (req as any).userId as string;
    const amount = Number((req as any).amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
      if (!user) throw new BusinessError('USER_NOT_FOUND');
      const balanceBefore = Number((user as any).walletBalance ?? 0);
      const balanceAfter = balanceBefore + amount;
      await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: amount } } as any });
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
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Admin approved customer top-up of ${await this.currencyService.formatWithCode(amount, (req as any).currency ?? 'USD')}.`,
      newValue: { requestId, amount } as any,
    });
    return this.toEntity(result);
  }

  async rejectTopup(requestId: string, reason?: string, actorId?: string): Promise<CustomerWalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'topup_request' || !(req as any).userId) {
      throw new BusinessError('TOPUP_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request is no longer pending');
    const updated = await this.prisma.walletTransaction.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'rejected', description: `${(req as any).description ?? 'Top-up request'} — rejected${reason ? `: ${reason.slice(0, 200)}` : ''}` },
    });
    if (updated.count === 0) throw new BusinessError('TOPUP_REQUEST_NOT_PENDING', 'Request was already handled');
    await this.auditLog.log({
      userId: actorId,
      action: 'TOPUP_REJECTED',
      entity: 'CustomerWallet',
      entityId: (req as any).userId,
      description: `Admin rejected customer top-up.${reason ? ` Reason: ${reason}` : ''}`,
      newValue: { requestId, reason: reason ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  // ─── Admin ───

  async getAdminWalletView(userId: string): Promise<{ user: { id: string; email: string; firstName: string | null; lastName: string | null }; balance: WalletBalance } | null> {
    const detail = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!detail) return null;
    return {
      user: { id: detail.id, email: detail.email, firstName: detail.firstName, lastName: detail.lastName },
      balance: await this.getBalance(userId),
    };
  }

  async adminAdjustBalance(
    userId: string,
    amount: number,
    reason: string,
    actorId?: string,
    currency?: string,
  ): Promise<CustomerWalletTransactionEntity> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    const walletCurrency = (user as any).walletCurrency ?? 'USD';
    const inWallet = await this.toUserCurrency(amount, currency, walletCurrency);
    const walletBalance = Number((user as any).walletBalance ?? 0);
    if (inWallet.amount < 0 && walletBalance < Math.abs(inWallet.amount)) {
      throw new BusinessError('INSUFFICIENT_FUNDS', 'Adjustment would result in negative balance');
    }
    const balanceBefore = walletBalance;
    const balanceAfter = balanceBefore + inWallet.amount;
    const [tx] = await this.prisma.$transaction([
      this.prisma.walletTransaction.create({
        data: {
          userId,
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
        } as any,
      }),
      this.prisma.user.update({ where: { id: userId }, data: { walletBalance: { increment: inWallet.amount } } as any }),
    ]);
    await this.auditLog.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Admin adjusted customer wallet by ${await this.currencyService.formatWithCode(inWallet.amount, walletCurrency)}. Balance: ${await this.currencyService.formatWithCode(balanceBefore, walletCurrency)} → ${await this.currencyService.formatWithCode(balanceAfter, walletCurrency)}. Reason: ${reason}`,
      newValue: { amount: inWallet.amount, currency: walletCurrency, balanceBefore, balanceAfter, reason } as any,
    });
    return this.toEntity(tx);
  }

  /**
   * Settle a customer wallet booking AFTER supplier confirmation.
   * Claims the pending customer hold and deducts the prepaid wallet in one
   * tx. No-ops for non-customer bookings (agent finalizer owns those).
   * No commission — customers earn none.
   */
  async finalizeSupplierConfirmedBooking(bookingId: string): Promise<void> {
    const flight = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, amount: true, currency: true },
    });
    const hotel = flight
      ? null
      : await this.prisma.hotelBooking.findUnique({
          where: { id: bookingId },
          select: { id: true, userId: true, amount: true, currency: true },
        });
    const booking = flight
      ? { ...flight, type: 'flight' as const }
      : hotel
        ? { ...hotel, type: 'hotel' as const }
        : null;
    if (!booking?.userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: booking.userId },
      select: { userType: true },
    });
    if (user?.userType !== 'CUSTOMER') return;

    try {
      await this.prisma.$transaction(async (tx) => {
        const hold = await tx.walletHold.findFirst({
          where: { bookingId, status: 'pending', userId: { not: null } },
        });
        if (!hold) return;

        const claimed = await tx.walletHold.updateMany({
          where: { id: hold.id, status: 'pending' },
          data: { status: 'confirmed' },
        });
        if (claimed.count === 0) return;

        await this.deductInTransaction(
          tx,
          (hold as any).userId,
          Number((hold as any).amount),
          booking.id,
          booking.type === 'flight' ? 'FLIGHT' : 'HOTEL',
          `Payment for ${booking.type} booking ${booking.id.slice(0, 8).toUpperCase()} (confirmed)`,
          (hold as any).currency ?? (booking as any).currency ?? undefined,
        );
      });
      this.logger.log(`Customer wallet settled for booking ${bookingId} (supplier confirmed)`);
    } catch (error: any) {
      this.logger.error(`Customer supplier-confirmed finalization failed for booking ${bookingId}: ${error?.message ?? error}`);
      throw error;
    }
  }

  /**
   * Find the customer wallet charge for a booking (if it was wallet-paid).
   */
  async getWalletDeduct(bookingId: string): Promise<{ userId: string; amount: number; currency: string } | null> {
    const deduct = await this.prisma.walletTransaction.findFirst({
      where: { bookingId, type: 'deduct', userId: { not: null }, status: 'completed' },
      select: { userId: true, amount: true, currency: true },
    });
    if (!deduct?.userId) return null;
    return { userId: deduct.userId as string, amount: Math.abs(Number(deduct.amount)), currency: (deduct as any).currency ?? 'USD' };
  }

  /**
   * Refund a wallet-paid booking back to the customer wallet.
   * Idempotent per booking (cancel-refund:{bookingId}) — replays no-op.
   * Returns null when the booking was not wallet-paid.
   */
  async refundWalletBooking(
    bookingId: string,
    refundAmount?: number,
    currency?: string,
    description?: string,
  ): Promise<CustomerWalletTransactionEntity | null> {
    const deduct = await this.getWalletDeduct(bookingId);
    if (!deduct) return null;
    const amount = refundAmount ?? deduct.amount;
    if (!(amount > 0)) return null;
    return this.deposit(
      deduct.userId,
      amount,
      undefined,
      description ?? `Refund for booking ${bookingId.slice(0, 8).toUpperCase()}`,
      undefined,
      `cancel-refund:${bookingId}`,
      currency ?? deduct.currency,
    );
  }

  /**
   * Release a pending customer hold (cancel before supplier confirm —
   * frees funds immediately instead of waiting for hold expiry).
   */
  async releaseHoldForBooking(bookingId: string): Promise<void> {
    await this.prisma.walletHold.updateMany({
      where: { bookingId, status: 'pending', userId: { not: null } },
      data: { status: 'released' },
    });
  }

  // ─── Manual withdrawals (customer wallet → off-platform payout) ───
  // Same lock-at-request pattern as agent withdrawals (see WalletService).

  async requestWalletWithdrawal(
    userId: string,
    amount: number,
    methodName: string,
    details: string,
  ): Promise<CustomerWalletTransactionEntity> {
    if (!(amount > 0)) throw new BusinessError('INVALID_AMOUNT', 'Withdrawal amount must be positive');
    if (amount > 100000) throw new BusinessError('INVALID_AMOUNT', 'Withdrawal amount exceeds the 100,000 limit');
    const cleanMethod = (methodName ?? '').trim().slice(0, 64);
    if (!cleanMethod) throw new BusinessError('WITHDRAWAL_METHOD_REQUIRED', 'Payment method name is required.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, walletCurrency: true },
    });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    const walletCurrency = (user as any).walletCurrency ?? 'USD';

    const record = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
      const balance = Number((current as any)?.walletBalance ?? 0);
      if (balance < amount) {
        const [availableText, requiredText] = await Promise.all([
          this.currencyService.formatWithCode(balance, walletCurrency),
          this.currencyService.formatWithCode(amount, walletCurrency),
        ]);
        throw new BusinessError('INSUFFICIENT_FUNDS', `Insufficient wallet balance. Available: ${availableText}, Required: ${requiredText}.`);
      }
      const locked = await tx.user.updateMany({
        where: { id: userId, walletBalance: { gte: amount } } as any,
        data: { walletBalance: { decrement: amount } } as any,
      });
      if (locked.count === 0) throw new BusinessError('INSUFFICIENT_FUNDS', 'Wallet balance changed. Please try again.');
      return tx.walletTransaction.create({
        data: {
          userId,
          type: 'withdrawal_request',
          amount: -amount,
          currency: walletCurrency,
          balanceBefore: balance,
          balanceAfter: balance - amount,
          reference: cleanMethod,
          description: (details ?? '').trim().slice(0, 500) || `Withdrawal via ${cleanMethod}`,
          status: 'pending',
        } as any,
      });
    });

    await this.auditLog.log({
      userId,
      action: 'WITHDRAWAL_REQUESTED',
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Customer requested withdrawal of ${await this.currencyService.formatWithCode(amount, walletCurrency)} via ${cleanMethod}. Funds locked pending approval.`,
      newValue: { requestId: record.id, amount, currency: walletCurrency, method: cleanMethod } as any,
    });
    try {
      const eventId = randomUUID();
      const payload = {
        requestId: record.id,
        kind: 'wallet',
        userId,
        customerEmail: (user as any)?.email ?? null,
        amount,
        currency: walletCurrency,
        method: cleanMethod,
      };
      await this.outboxWriter.writeSafe({
        eventType: 'wallet.withdrawal.requested',
        aggregateType: 'CustomerWallet',
        aggregateId: record.id,
        idempotencyKey: eventId,
        payload,
      });
      this.notifications
        .notifyDirect({
          eventType: 'wallet.withdrawal.requested',
          aggregateType: 'CustomerWallet',
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

  async listMyWithdrawals(userId: string): Promise<CustomerWalletTransactionEntity[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { userId, type: 'withdrawal_request' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toEntity(r));
  }

  async listAllWithdrawals(status?: string): Promise<Array<CustomerWalletTransactionEntity & { customerEmail: string | null }>> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'withdrawal_request', userId: { not: null }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = [...new Set(rows.map((r) => (r as any).userId).filter(Boolean))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ ...this.toEntity(r), customerEmail: emailById.get((r as any).userId) ?? null }));
  }

  async approveWithdrawal(requestId: string, paymentReference?: string, actorId?: string): Promise<CustomerWalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || !(req as any).userId) {
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
      entity: 'CustomerWallet',
      entityId: (req as any).userId,
      description: `Admin approved customer withdrawal of ${await this.currencyService.formatWithCode(Math.abs(Number((req as any).amount)), (req as any).currency ?? 'USD')}${paymentReference ? ` (ref ${paymentReference})` : ''}. Paid off-platform.`,
      newValue: { requestId, paymentReference: paymentReference ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  async rejectWithdrawal(requestId: string, reason?: string, actorId?: string): Promise<CustomerWalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || !(req as any).userId) {
      throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request is no longer pending');
    const locked = Math.abs(Number((req as any).amount));
    const userId = (req as any).userId as string;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'rejected', description: `${(req as any).description ?? 'Withdrawal'} — rejected${reason ? `: ${reason.slice(0, 200)}` : ''}` },
      });
      if (claimed.count === 0) throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request was already handled');
      await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: locked } } as any });
    });
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_REJECTED',
      entity: 'CustomerWallet',
      entityId: userId,
      description: `Admin rejected customer withdrawal. Locked funds returned to wallet.${reason ? ` Reason: ${reason}` : ''}`,
      newValue: { requestId, reason: reason ?? null } as any,
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  async cancelWithdrawal(requestId: string, userId: string): Promise<CustomerWalletTransactionEntity> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'withdrawal_request' || (req as any).userId !== userId) {
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
      await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: locked } } as any });
    });
    return this.toEntity(await this.prisma.walletTransaction.findUnique({ where: { id: requestId } }));
  }

  toEntity(r: any): CustomerWalletTransactionEntity {    return {
      id: r.id,
      userId: r.userId,
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
