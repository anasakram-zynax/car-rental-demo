import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { WalletService } from '../wallet/wallet.service';
import { CurrencyService } from '../currency/application/services/currency.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../notifications/application/notification.service';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';

export interface CommissionRecordEntity {
  id: string;
  agentProfileId: string;
  bookingId: string;
  bookingType: string;
  ruleId: string | null;
  bookingAmount: number;
  commissionAmount: number;
  rate: number;
  rateType: string;
  currency: string;
  status: string;
  payoutId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRuleEntity {
  id: string;
  name: string;
  description: string | null;
  type: string;
  rate: number;
  applyTo: string;
  minAmount: number | null;
  maxAmount: number | null;
  agentTierId: string | null;
  agentId: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionSummary {
  totalPending: number;
  totalPaid: number;
  totalCommission: number;
  /** Reporting currency of the three totals above. */
  currency: string;
  bookingCount: number;
  byPeriod: { period: string; amount: number; count: number }[];
}

export interface CommissionFilters {
  page?: number;
  limit?: number;
  status?: string;
  bookingType?: string;
  agentProfileId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface PaginatedCommissions {
  items: CommissionRecordEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PendingPayouts {
  totalAgents: number;
  totalAmount: number;
  /** Reporting currency of totalAmount and per-record totals. */
  currency: string;
  totalRecords: number;
  records: Array<{
    agentProfileId: string;
    agentName: string | null;
    agentEmail: string | null;
    totalCommission: number;
    count: number;
  }>;
}

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly walletService: WalletService,
    private readonly currencyService: CurrencyService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Calculate commission for a booking. Called asynchronously via outbox.
   * Finds matching commission rules and creates a CommissionRecord.
   */
  async calculateCommission(input: {
    bookingId: string;
    bookingType: 'flight' | 'hotel' | 'package';
    agentProfileId: string;
    bookingAmount: number;
  }): Promise<CommissionRecordEntity> {
    const { bookingId, bookingType, agentProfileId, bookingAmount } = input;

    // Find the agent's commission rate (from AgentProfile or CommissionTier)
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: {
        commissionRate: true,
        commissionTierId: true,
        commissionTier: {
          select: {
            flightCommissionRate: true,
            hotelCommissionRate: true,
            packageCommissionRate: true,
          },
        },
      },
    });
    if (!agent) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    // Resolve the booking's settlement currency so commission records reflect
    // the currency the agent actually transacted in instead of assuming USD.
    let currency = 'USD';
    if (bookingType === 'flight') {
      const flight = await this.prisma.flightBooking.findUnique({
        where: { id: bookingId },
        select: { currency: true },
      });
      currency = flight?.currency ?? 'USD';
    } else if (bookingType === 'hotel') {
      const hotel = await this.prisma.hotelBooking.findUnique({
        where: { id: bookingId },
        select: { currency: true },
      });
      currency = hotel?.currency ?? 'USD';
    }

    // Find matching commission rules in priority order
    // Date range and amount filtering is done in-memory for flexibility
    const matchingRules = await this.prisma.commissionRule.findMany({
      where: {
        isActive: true,
        // Support both singular (new) and plural (legacy DB rows) applyTo values
        applyTo: { in: [bookingType, `${bookingType}s`, 'all'] },
        OR: [
          { agentId: agentProfileId },
          ...(agent.commissionTierId ? [{ agentTierId: agent.commissionTierId }] : []),
          { agentId: null, agentTierId: null },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    // Filter date-range rules in-memory
    const now = new Date();
    const validRules = matchingRules.filter((r) => {
      if (r.startDate && r.startDate > now) return false;
      if (r.endDate && r.endDate < now) return false;
      if (r.minAmount && Number(r.minAmount) > bookingAmount) return false;
      if (r.maxAmount && Number(r.maxAmount) < bookingAmount) return false;
      return true;
    });

    // Apply the highest-priority matching rule, or fall back to agent's rate
    let rate: number;
    let rateType: string;
    let ruleId: string | null = null;

    if (validRules.length > 0) {
      const rule = validRules[0];
      rate = Number(rule.rate);
      rateType = rule.type === 'flat' ? 'flat' : 'percentage';
      ruleId = rule.id;
    } else {
      // Fall back to agent's profile commission rate / tier rate
      const tierRates = agent.commissionTier;
      if (bookingType === 'flight') {
        rate = Number(tierRates?.flightCommissionRate ?? agent.commissionRate);
      } else if (bookingType === 'hotel') {
        rate = Number(tierRates?.hotelCommissionRate ?? agent.commissionRate);
      } else {
        rate = Number(tierRates?.packageCommissionRate ?? agent.commissionRate);
      }
      rateType = 'percentage';
    }

    const commissionAmount = Math.round(
      (rateType === 'flat' ? rate : (bookingAmount * rate) / 100) * 100
    ) / 100;

    // Check for idempotency inside a transaction — prevents race condition where
    // two concurrent bookings for the same bookingId both try to create a record.
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.commissionRecord.findFirst({
        where: { bookingId, bookingType },
      });
      if (existing) return existing;

      return tx.commissionRecord.create({
        data: {
          agentProfileId,
          bookingId,
          bookingType,
          ruleId,
          bookingAmount,
          commissionAmount,
          rate,
          rateType,
          currency,
          status: 'pending',
        },
      });
    });

    this.logger.log(
      `Commission calculated: ${commissionAmount} (${rate}${rateType === 'percentage' ? '%' : ''}) for booking ${bookingId}`,
    );

    return this.toEntity(record);
  }

  /** Get agent's commission summary (totals by period) */
  async getAgentCommissionSummary(
    agentProfileId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<CommissionSummary> {
    const where: any = { agentProfileId };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const records = await this.prisma.commissionRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Records can each be in a different currency (per-booking currency) —
    // convert every amount to a single reporting currency (USD, matching the
    // wallet's existing implicit convention) BEFORE summing. Summing raw
    // commissionAmount across currencies would silently add e.g. EUR + USD
    // as if they were the same unit.
    const REPORTING_CURRENCY = 'USD';
    const amountsUsd = await Promise.all(
      records.map((r) => this.currencyService.convert(Number(r.commissionAmount), r.currency ?? 'USD', REPORTING_CURRENCY)),
    );

    const totalPending = records
      .reduce((s, r, i) => (r.status === 'pending' ? s + amountsUsd[i].amount : s), 0);
    const totalPaid = records
      .reduce((s, r, i) => (r.status === 'paid' ? s + amountsUsd[i].amount : s), 0);
    const totalCommission = amountsUsd.reduce((s, a) => s + a.amount, 0);

    // Group by month for byPeriod
    const periodMap = new Map<string, { amount: number; count: number }>();
    records.forEach((r, i) => {
      const period = r.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const existing = periodMap.get(period) ?? { amount: 0, count: 0 };
      existing.amount += amountsUsd[i].amount;
      existing.count += 1;
      periodMap.set(period, existing);
    });
    const byPeriod = Array.from(periodMap.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalPending,
      totalPaid,
      totalCommission,
      currency: REPORTING_CURRENCY,
      bookingCount: records.length,
      byPeriod,
    };
  }

  /** Get agent's earnings per booking with pagination */
  async getEarningsPerBooking(
    agentProfileId: string,
    filters?: CommissionFilters,
  ): Promise<PaginatedCommissions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { agentProfileId };
    if (filters?.status) where.status = filters.status;
    if (filters?.bookingType) where.bookingType = filters.bookingType;
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.commissionRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.commissionRecord.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toEntity(i)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Admin: mark commissions as paid */
  async markAsPaid(
    commissionIds: string[],
    payoutId?: string,
    actorId?: string,
  ): Promise<number> {
    const records = await this.prisma.commissionRecord.findMany({
      where: { id: { in: commissionIds }, status: 'pending' },
    });

    if (records.length === 0) return 0;

    // Group by agent AND record currency — records for one agent can span
    // currencies, and the wallet is single-currency. Deposit per currency so
    // the service converts each leg instead of adding mixed amounts raw.
    const agentTotals = new Map<
      string,
      { total: number; currency: string; recordIds: string[] }
    >();
    for (const record of records) {
      const key = `${record.agentProfileId}::${(record.currency ?? 'USD').toUpperCase()}`;
      const existing = agentTotals.get(key) ?? {
        total: 0,
        currency: (record.currency ?? 'USD').toUpperCase(),
        recordIds: [] as string[],
      };
      existing.total += Number(record.commissionAmount);
      existing.recordIds.push(record.id);
      agentTotals.set(key, existing);
    }

    // Deposit FIRST, then mark only the records whose deposit succeeded as paid.
    // A failed deposit must NOT mark its records paid — that would silently
    // erase the agent's pending commission (money bug).
    let paidCount = 0;
    for (const [key, data] of agentTotals) {
      const agentProfileId = key.split('::')[0];
      try {
        await this.walletService.deposit(
          agentProfileId,
          data.total,
          payoutId ?? undefined,
          `Commission payout — ${data.recordIds.length} booking(s)`,
          actorId,
          undefined,
          data.currency,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to deposit commission to agent ${agentProfileId}: ${err.message} — ${data.recordIds.length} record(s) remain pending for retry`,
        );
        continue;
      }

      const result = await this.prisma.commissionRecord.updateMany({
        where: { id: { in: data.recordIds }, status: 'pending' },
        data: {
          status: 'paid',
          payoutId: payoutId ?? null,
          paidAt: new Date(),
        },
      });
      paidCount += result.count;
    }

    await this.auditLog.log({
      userId: actorId,
      action: 'COMMISSION_PAID',
      entity: 'CommissionRecord',
      entityId: payoutId ?? commissionIds.join(','),
      description: `Paid ${paidCount} of ${records.length} requested commission(s) via wallet deposit`,
      newValue: { count: paidCount, requested: records.length, payoutId, commissionIds } as any,
    });

    return paidCount;
  }

  /**
   * Agent self-service: move the FULL pending commission balance into the
   * agent's own wallet. Reuses markAsPaid (deposit-first, per-currency) so
   * money can never be erased — payoutId is tagged self-transfer.
   */
  async transferToWallet(agentProfileId: string, actorId?: string): Promise<{ count: number }> {
    const owner = await this.prisma.agentProfile.findUnique({ where: { id: agentProfileId }, select: { userId: true } });
    if (owner) {
      await this.walletService.requireAgentPermission(owner.userId, PermissionCode.AGENT_USE_WALLET);
    }
    const pending = await this.prisma.commissionRecord.findMany({
      where: { agentProfileId, status: 'pending' },
      select: { id: true },
    });
    if (pending.length === 0) throw new BusinessError('NO_PENDING_COMMISSION', 'No pending commission to transfer.');
    const count = await this.markAsPaid(
      pending.map((r) => r.id),
      `self-transfer:${randomUUID()}`,
      actorId,
    );
    if (count === 0) throw new BusinessError('TRANSFER_FAILED', 'Transfer failed. Please try again.');
    return { count };
  }

  /**
   * Agent: request off-platform withdrawal of commissions (manual process —
   * admin pays via company bank, no gateway integration). Amount stored is a
   * converted snapshot for display; APPROVE pays the full current pending
   * balance (see payOutOffPlatformWithdrawal) so partial-record math never
   * over/under-pays.
   */
  async requestOffPlatformWithdrawal(
    agentProfileId: string,
    methodName: string,
    details: string,
    actorId?: string,
  ): Promise<any> {
    const owner = await this.prisma.agentProfile.findUnique({ where: { id: agentProfileId }, select: { userId: true } });
    if (owner) {
      await this.walletService.requireAgentPermission(owner.userId, PermissionCode.AGENT_WITHDRAW_FUNDS);
    }
    const cleanMethod = (methodName ?? '').trim().slice(0, 64);
    if (!cleanMethod) throw new BusinessError('WITHDRAWAL_METHOD_REQUIRED', 'Payment method name is required.');
    const pending = await this.prisma.commissionRecord.findMany({
      where: { agentProfileId, status: 'pending' },
      select: { commissionAmount: true, currency: true },
    });
    if (pending.length === 0) throw new BusinessError('NO_PENDING_COMMISSION', 'No pending commission to withdraw.');
    const walletCurrency = await this.walletService.getProfileCurrency(agentProfileId);
    let total = 0;
    for (const r of pending) {
      const inWallet = await this.walletService.toWalletCurrency(Number(r.commissionAmount), r.currency, walletCurrency);
      total += inWallet.amount;
    }
    total = Math.round(total * 100) / 100;
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { user: { select: { email: true } } },
    });
    const record = await this.prisma.walletTransaction.create({
      data: {
        agentProfileId,
        type: 'commission_withdrawal_request',
        amount: total,
        currency: walletCurrency,
        balanceBefore: 0,
        balanceAfter: 0,
        reference: cleanMethod,
        description: (details ?? '').trim().slice(0, 500) || `Commission withdrawal via ${cleanMethod}`,
        status: 'pending',
      },
    });
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_REQUESTED',
      entity: 'CommissionRecord',
      entityId: agentProfileId,
      description: `Agent requested commission withdrawal of ${await this.currencyService.formatWithCode(total, walletCurrency)} via ${cleanMethod}.`,
      newValue: { requestId: record.id, amount: total, currency: walletCurrency, method: cleanMethod } as any,
    });
    try {
      const eventId = randomUUID();
      const payload = {
        requestId: record.id,
        kind: 'commission',
        agentProfileId,
        agentEmail: (profile as any)?.user?.email ?? null,
        amount: total,
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
    return record;
  }

  async listOwnCommissionWithdrawals(agentProfileId: string): Promise<any[]> {
    return this.prisma.walletTransaction.findMany({
      where: { agentProfileId, type: 'commission_withdrawal_request' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listAllCommissionWithdrawals(status?: string): Promise<any[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'commission_withdrawal_request', agentProfileId: { not: null }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = [...new Set(rows.map((r) => r.agentProfileId).filter((id): id is string => !!id))];
    const profiles = await this.prisma.agentProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, user: { select: { email: true } } },
    });
    const emailById = new Map(profiles.map((p: any) => [p.id, p.user?.email ?? null]));
    return rows.map((r) => ({ ...(r as any), agentEmail: emailById.get((r as any).agentProfileId ?? '') ?? null }));
  }

  /**
   * Admin: pay out the FULL current pending commission balance off-platform.
   * Atomic single-winner claim on records AND request — a racing admin payout
   * (markAsPaid) or second approval pays 0 and fails clean instead of
   * double-paying.
   */
  async payOutOffPlatformWithdrawal(
    requestId: string,
    paymentReference?: string,
    actorId?: string,
  ): Promise<{ recordsPaid: number }> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'commission_withdrawal_request' || !(req as any).agentProfileId) {
      throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    }
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request is no longer pending');
    const agentProfileId = (req as any).agentProfileId as string;

    const claimed = await this.prisma.commissionRecord.updateMany({
      where: { agentProfileId, status: 'pending' },
      data: { status: 'paid', payoutId: `withdrawal:${requestId}`, paidAt: new Date() },
    });
    if (claimed.count === 0) throw new BusinessError('WITHDRAWAL_NOTHING_PENDING', 'No pending commission left to pay.');
    const finalized = await this.prisma.walletTransaction.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'completed', paymentId: paymentReference?.slice(0, 128) ?? null },
    });
    if (finalized.count === 0) {
      // Request raced (rejected concurrently) — records already paid stay paid;
      // admin reconciles the off-platform payment manually.
      this.logger.error(`Commission withdrawal ${requestId} raced: ${claimed.count} record(s) paid but request not pending`);
      throw new BusinessError('WITHDRAWAL_RACE', 'Records were paid but the request changed state. Reconcile manually.');
    }
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_APPROVED',
      entity: 'CommissionRecord',
      entityId: agentProfileId,
      description: `Admin paid ${claimed.count} commission record(s) off-platform${paymentReference ? ` (ref ${paymentReference})` : ''}.`,
      newValue: { requestId, recordsPaid: claimed.count, paymentReference: paymentReference ?? null } as any,
    });
    return { recordsPaid: claimed.count };
  }

  async rejectCommissionWithdrawal(requestId: string, reason?: string, actorId?: string): Promise<any> {
    const req = await this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
    if (!req || (req as any).type !== 'commission_withdrawal_request') throw new BusinessError('WITHDRAWAL_REQUEST_NOT_FOUND');
    if ((req as any).status !== 'pending') throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request is no longer pending');
    const updated = await this.prisma.walletTransaction.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'rejected', description: `${(req as any).description ?? 'Commission withdrawal'} — rejected${reason ? `: ${reason.slice(0, 200)}` : ''}` },
    });
    if (updated.count === 0) throw new BusinessError('WITHDRAWAL_NOT_PENDING', 'Request was already handled');
    await this.auditLog.log({
      userId: actorId,
      action: 'WITHDRAWAL_REJECTED',
      entity: 'CommissionRecord',
      entityId: (req as any).agentProfileId,
      description: `Admin rejected commission withdrawal.${reason ? ` Reason: ${reason}` : ''}`,
      newValue: { requestId, reason: reason ?? null } as any,
    });
    return this.prisma.walletTransaction.findUnique({ where: { id: requestId } });
  }

  /** Revert commission on booking cancellation */
  async revertOnCancellation(bookingId: string): Promise<void> {
    const record = await this.prisma.commissionRecord.findFirst({
      where: { bookingId, status: { in: ['pending', 'paid'] } },
    });
    if (!record) {
      this.logger.warn(`No commission record found for booking ${bookingId} to revert`);
      return;
    }

    // If commission was already paid, claw back from the agent's wallet — but
    // ONLY when the booking was actually settled from the wallet (a 'deduct'
    // transaction exists). Card-paid bookings never touched the wallet, so a
    // blind clawback would wrongly charge the agent twice for one booking.
    if (record.status === 'paid') {
      const walletDeduction = await this.prisma.walletTransaction.findFirst({
        where: { bookingId, type: 'deduct' },
        select: { id: true },
      });

      if (walletDeduction) {
        const clawbackAmountText = await this.currencyService.formatWithCode(
          Number(record.commissionAmount),
          record.currency,
        );
        try {
          // walletService.deduct manages its own transaction — no nested tx here.
          // Converted into the wallet currency inside deduct.
          await this.walletService.deduct(
            record.agentProfileId,
            Number(record.commissionAmount),
            bookingId,
            record.bookingType,
            `Commission clawback — booking ${bookingId} cancelled`,
            undefined,
            record.currency ?? undefined,
          );
          this.logger.log(`Commission clawback: ${clawbackAmountText} deducted from agent ${record.agentProfileId} wallet`);
        } catch (err: any) {
          // Never block the cancellation flow over a failed clawback — flag it
          // for admin follow-up instead and still reverse the record.
          this.logger.error(`Commission clawback failed for agent ${record.agentProfileId}: ${err.message}`);
          await this.auditLog.log({
            action: 'COMMISSION_CLAWBACK_FAILED',
            entity: 'CommissionRecord',
            entityId: record.id,
            description: `Clawback of ${clawbackAmountText} for booking ${bookingId} failed: ${err.message}. Manual review required.`,
            newValue: { bookingId, amount: Number(record.commissionAmount), error: err.message } as any,
          });
        }
      } else {
        this.logger.log(`Commission ${record.id} was paid but booking ${bookingId} was not wallet-settled — skipping wallet clawback`);
      }
    }

    // For pending commissions (or after a handled clawback), just update status
    await this.prisma.commissionRecord.update({
      where: { id: record.id },
      data: { status: 'reversed' },
    });
    this.logger.log(`Commission ${record.id} reversed for booking ${bookingId}`);
  }

  /** Admin: list all commission records with optional filters */
  async findAll(filters?: CommissionFilters): Promise<PaginatedCommissions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.bookingType) where.bookingType = filters.bookingType;
    if (filters?.agentProfileId) where.agentProfileId = filters.agentProfileId;
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.commissionRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.commissionRecord.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toEntity(i)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Admin: get pending payouts summary (grouped by agent) */
  async getPendingPayouts(): Promise<PendingPayouts> {
    // DB-side grouping — the previous version loaded every pending row and
    // converted per row. Group by (agent, currency) first, convert per group.
    const REPORTING_CURRENCY = 'USD';
    const groups = await this.prisma.commissionRecord.groupBy({
      by: ['agentProfileId', 'currency'],
      where: { status: 'pending' },
      _sum: { commissionAmount: true },
      _count: { id: true },
    });

    // Records can each be in a different currency — convert every group to
    // a single reporting currency BEFORE summing (same semantics as before).
    const converted = await Promise.all(
      groups.map(async (g) => ({
        agentProfileId: g.agentProfileId,
        amount: (
          await this.currencyService.convert(
            Number(g._sum.commissionAmount ?? 0),
            g.currency ?? 'USD',
            REPORTING_CURRENCY,
          )
        ).amount,
        count: g._count.id,
      })),
    );

    // Group by agent
    const agentMap = new Map<string, { totalCommission: number; count: number }>();
    for (const c of converted) {
      const existing = agentMap.get(c.agentProfileId) ?? { totalCommission: 0, count: 0 };
      existing.totalCommission += c.amount;
      existing.count += c.count;
      agentMap.set(c.agentProfileId, existing);
    }

    // Fetch agent names
    const agentIds = Array.from(agentMap.keys());
    const agents = await this.prisma.agentProfile.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, userId: true },
    });
    const userIds = agents.map((a) => a.userId);
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const agentUserMap = new Map(agents.map((a) => [a.id, a.userId]));

    const records = Array.from(agentMap.entries()).map(([agentProfileId, data]) => {
      const userId = agentUserMap.get(agentProfileId);
      const user = userId ? userMap.get(userId) : null;
      return {
        agentProfileId,
        agentName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : null,
        agentEmail: user?.email ?? null,
        totalCommission: data.totalCommission,
        count: data.count,
      };
    });

    return {
      totalAgents: records.length,
      totalAmount: records.reduce((s, r) => s + r.totalCommission, 0),
      currency: REPORTING_CURRENCY,
      totalRecords: records.reduce((s, r) => s + r.count, 0),
      records: records.sort((a, b) => b.totalCommission - a.totalCommission),
    };
  }

  /** Admin: CRUD for commission rules */
  async createRule(data: {
    name: string;
    type: string;
    rate: number;
    applyTo: string;
    description?: string;
    agentTierId?: string;
    agentId?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
    priority?: number;
  }): Promise<CommissionRuleEntity> {
    const rule = await this.prisma.commissionRule.create({
      data: {
        name: data.name,
        type: data.type,
        rate: data.rate,
        applyTo: data.applyTo,
        description: data.description ?? null,
        agentTierId: data.agentTierId ?? null,
        agentId: data.agentId ?? null,
        minAmount: data.minAmount ?? null,
        maxAmount: data.maxAmount ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        priority: data.priority ?? 0,
      },
    });
    return this.ruleToEntity(rule);
  }

  async updateRule(id: string, data: Partial<{
    name: string; type: string; rate: number; applyTo: string;
    description: string; agentTierId: string; agentId: string;
    minAmount: number; maxAmount: number; startDate: string; endDate: string;
    priority: number; isActive: boolean;
  }>): Promise<CommissionRuleEntity> {
    // Verify rule exists before updating to avoid Prisma P2025 error
    const existing = await this.prisma.commissionRule.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new BusinessError('RULE_NOT_FOUND', `Commission rule ${id} not found`);
    }

    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: updateData,
    });
    return this.ruleToEntity(rule);
  }

  async deleteRule(id: string): Promise<void> {
    await this.prisma.commissionRule.delete({ where: { id } });
  }

  async findRules(): Promise<CommissionRuleEntity[]> {
    const rules = await this.prisma.commissionRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rules.map((r) => this.ruleToEntity(r));
  }

  // ── Mappers ─────────────────────────────────────────────

  private toEntity(r: any): CommissionRecordEntity {
    return {
      id: r.id,
      agentProfileId: r.agentProfileId,
      bookingId: r.bookingId,
      bookingType: r.bookingType,
      ruleId: r.ruleId ?? null,
      bookingAmount: Number(r.bookingAmount),
      commissionAmount: Number(r.commissionAmount),
      rate: Number(r.rate),
      rateType: r.rateType,
      currency: r.currency ?? 'USD',
      status: r.status,
      payoutId: r.payoutId ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private ruleToEntity(r: any): CommissionRuleEntity {
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      type: r.type,
      rate: Number(r.rate),
      applyTo: r.applyTo,
      minAmount: r.minAmount ? Number(r.minAmount) : null,
      maxAmount: r.maxAmount ? Number(r.maxAmount) : null,
      agentTierId: r.agentTierId ?? null,
      agentId: r.agentId ?? null,
      startDate: r.startDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
      isActive: r.isActive,
      priority: r.priority,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
