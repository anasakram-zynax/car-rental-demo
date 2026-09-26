import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PromoCodeRepositoryToken, type IPromoCodeRepository } from '../ports/promo-code.repository.port';
import type { CreatePromoCodeInput, UpdatePromoCodeInput, PaginatedPromoCodes, PromoCodeListFilters, PromoStatsSummary, PromoRedemptionRecord, PromoAuditLogRecord } from '../ports/promo-code.repository.port';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { PromoCodeStatus } from '../../domain/enums';

@Injectable()
export class PromoCodeAdminService {
  private readonly logger = new Logger(PromoCodeAdminService.name);

  constructor(
    @Inject(PromoCodeRepositoryToken) private readonly promoCodeRepo: IPromoCodeRepository,
    private readonly currencyService: CurrencyService,
  ) {}

  async list(filters: PromoCodeListFilters): Promise<PaginatedPromoCodes> {
    return this.promoCodeRepo.findMany(filters);
  }

  async getById(id: string) {
    const promo = await this.promoCodeRepo.findById(id);
    if (!promo) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }
    return promo;
  }

  async getByCode(code: string) {
    const promo = await this.promoCodeRepo.findByCode(code);
    if (!promo) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }
    return promo;
  }

  async create(input: CreatePromoCodeInput & { createdById?: string }) {
    const normalizedCode = input.code.trim().toUpperCase();

    const existing = await this.promoCodeRepo.findByCode(normalizedCode);
    if (existing) {
      throw new BusinessError('PROMO_CODE_ALREADY_EXISTS');
    }

    if (input.discountType === 'PERCENTAGE') {
      if (!input.discountPercentBps) {
        throw new BusinessError('PROMO_CODE_INVALID', 'Percentage promo codes must specify discountPercentBps.');
      }
      if (input.discountPercentBps < 1 || input.discountPercentBps > 10000) {
        throw new BusinessError('PROMO_CODE_INVALID', 'discountPercentBps must be between 1 and 10000 (10000 = 100%).');
      }
    }

    if (input.discountType === 'FIXED') {
      if (input.maxDiscountMinor) {
        throw new BusinessError('PROMO_CODE_INVALID', 'maxDiscountMinor is only applicable to PERCENTAGE discounts.');
      }
      if (input.discountValueMinor <= 0) {
        throw new BusinessError('PROMO_CODE_INVALID', 'discountValueMinor must be greater than 0 for FIXED discounts.');
      }
    }

    if (input.startsAt && input.endsAt) {
      const starts = new Date(input.startsAt);
      const ends = new Date(input.endsAt);
      if (starts >= ends) {
        throw new BusinessError('PROMO_CODE_INVALID', 'startsAt must be before endsAt.');
      }
    }

    const promo = await this.promoCodeRepo.create({
      ...input,
      code: normalizedCode,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    });

    await this.promoCodeRepo.createAuditLog(promo.id, input.createdById ?? null, 'create', null, promo);

    this.logger.log(`Promo code created: ${normalizedCode} by ${input.createdById ?? 'system'}`);
    return promo;
  }

  async update(id: string, input: UpdatePromoCodeInput & { updatedById?: string }) {
    const existing = await this.promoCodeRepo.findById(id);
    if (!existing) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }

    if (input.code) {
      const normalizedCode = input.code.trim().toUpperCase();
      if (normalizedCode !== existing.code) {
        const duplicate = await this.promoCodeRepo.findByCode(normalizedCode);
        if (duplicate) {
          throw new BusinessError('PROMO_CODE_ALREADY_EXISTS');
        }
      }
      input.code = normalizedCode;
    }

    const effectiveDiscountType = input.discountType ?? existing.discountType;

    if (input.discountType === 'PERCENTAGE' || (!input.discountType && existing.discountType === 'PERCENTAGE')) {
      const bps = input.discountPercentBps ?? existing.discountPercentBps;
      if (input.discountType === 'PERCENTAGE' && !bps) {
        throw new BusinessError('PROMO_CODE_INVALID', 'Percentage promo codes must specify discountPercentBps.');
      }
      if (bps !== undefined && bps !== null && (bps < 1 || bps > 10000)) {
        throw new BusinessError('PROMO_CODE_INVALID', 'discountPercentBps must be between 1 and 10000 (10000 = 100%).');
      }
    }

    if (effectiveDiscountType === 'FIXED') {
      if (input.maxDiscountMinor) {
        throw new BusinessError('PROMO_CODE_INVALID', 'maxDiscountMinor is only applicable to PERCENTAGE discounts.');
      }
      if (input.discountValueMinor !== undefined && input.discountValueMinor <= 0) {
        throw new BusinessError('PROMO_CODE_INVALID', 'discountValueMinor must be greater than 0 for FIXED discounts.');
      }
    }

    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BusinessError('PROMO_CODE_INVALID', 'startsAt must be before endsAt.');
    }

    const before = { ...existing };
    const updated = await this.promoCodeRepo.update(id, {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    });

    await this.promoCodeRepo.createAuditLog(id, input.updatedById ?? null, 'update', before, updated);

    this.logger.log(`Promo code updated: ${id} by ${input.updatedById ?? 'system'}`);
    return updated;
  }

  async updateStatus(id: string, status: PromoCodeStatus, actorId?: string) {
    const existing = await this.promoCodeRepo.findById(id);
    if (!existing) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }

    const validTransitions: Record<string, PromoCodeStatus[]> = {
      [PromoCodeStatus.DRAFT]: [PromoCodeStatus.ACTIVE, PromoCodeStatus.ARCHIVED],
      [PromoCodeStatus.ACTIVE]: [PromoCodeStatus.PAUSED, PromoCodeStatus.EXPIRED, PromoCodeStatus.ARCHIVED],
      [PromoCodeStatus.PAUSED]: [PromoCodeStatus.ACTIVE, PromoCodeStatus.ARCHIVED],
      [PromoCodeStatus.EXPIRED]: [PromoCodeStatus.ARCHIVED],
      [PromoCodeStatus.ARCHIVED]: [],
    };

    const allowed = validTransitions[existing.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BusinessError('PROMO_CODE_INVALID', `Cannot transition from ${existing.status} to ${status}.`);
    }

    const before = { ...existing };
    const updated = await this.promoCodeRepo.updateStatus(id, status);

    const action = status === PromoCodeStatus.PAUSED ? 'pause' :
                   status === PromoCodeStatus.ACTIVE ? 'resume' : 'status_change';
    await this.promoCodeRepo.createAuditLog(id, actorId ?? null, action, before, updated);

    this.logger.log(`Promo code ${action}: ${id} by ${actorId ?? 'system'}`);
    return updated;
  }

  async archive(id: string, actorId?: string) {
    return this.updateStatus(id, PromoCodeStatus.ARCHIVED, actorId);
  }

  async getStats(): Promise<PromoStatsSummary> {
    const stats = await this.promoCodeRepo.getStats();
    const groups = stats.byCurrency ?? [];
    if (groups.length <= 1) {
      // Zero or single currency — raw total is already correct; just stamp
      // the code so the UI never assumes USD.
      return {
        ...stats,
        totalDiscountCurrency: groups[0]?.currency ?? stats.totalDiscountCurrency ?? 'USD',
      };
    }
    // Mixed currencies: convert each group's MINOR total through major units
    // (minor → major in source decimals → convert → minor in target decimals).
    // Converting raw minors directly would treat cents as whole units.
    const actives = await this.currencyService.listActive();
    const target =
      actives.find((c: any) => c.isDefault)?.code ??
      actives.find((c: any) => c.isBase)?.code ??
      'USD';
    let totalMinor = 0;
    // Collect per-group results first, then sum synchronously — accumulating
    // into a shared total inside Promise.all workers is a read-modify-write
    // race (last writer wins, silently dropping groups).
    const convertedMinors = await Promise.all(
      groups.map(async (g) => {
        try {
          const major = await this.currencyService.fromSmallestUnit(g.minor, g.currency);
          const converted = await this.currencyService.convert(major, g.currency, target);
          return await this.currencyService.toSmallestUnit(converted.amount, target);
        } catch {
          return g.minor;
        }
      }),
    );
    totalMinor = convertedMinors.reduce((s, v) => s + v, 0);
    return { ...stats, totalDiscountMinor: totalMinor, totalDiscountCurrency: target };
  }

  async getRedemptions(promoCodeId: string, page = 1, limit = 20) {
    const promo = await this.promoCodeRepo.findById(promoCodeId);
    if (!promo) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }
    return this.promoCodeRepo.getRedemptions(promoCodeId, page, limit);
  }

  async getAuditLogs(promoCodeId: string): Promise<PromoAuditLogRecord[]> {
    const promo = await this.promoCodeRepo.findById(promoCodeId);
    if (!promo) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND');
    }
    return this.promoCodeRepo.getAuditLogs(promoCodeId);
  }
}
