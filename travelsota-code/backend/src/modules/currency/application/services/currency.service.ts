import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { CreateCurrencyDto } from '../../api/dto/create-currency.dto';
import type { UpdateCurrencyDto } from '../../api/dto/update-currency.dto';
import type {
  Money,
  PricingBreakdown,
  BuildPricingBreakdownInput,
  ExchangeRateSnapshot,
} from '../../../../shared/helpers/pricing.types';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private activeCache: { data: any[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000; // 60s — currencies change via rate syncs

  /** Per-code in-memory cache to avoid DB connection storm during offer mapping */
  private codeCache = new Map<string, { data: any; expiresAt: number }>();
  /** Deduplication: concurrent getByCode calls for the same code share one DB query */
  private pendingLookups = new Map<string, Promise<any>>();

  constructor(private readonly prisma: PrismaService) {}

  /** List all currencies (admin view — includes inactive) */
  async listAll() {
    return this.prisma.currency.findMany({
      orderBy: [{ isBase: 'desc' }, { isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  /** List only active currencies (public view) — cached in-memory */
  async listActive() {
    const now = Date.now();
    if (this.activeCache && now < this.activeCache.expiresAt) {
      return this.activeCache.data;
    }
    const data = await this.prisma.currency.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
    this.activeCache = { data, expiresAt: now + this.CACHE_TTL_MS };
    return data;
  }

  private invalidateCache() {
    this.activeCache = null;
    this.codeCache.clear();
  }

  /** Get single currency by ID */
  async getById(id: string) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) throw new NotFoundException(`Currency with id "${id}" not found`);
    return currency;
  }

  /** Get single currency by code — cached in-memory with deduplication */
  async getByCode(code: string) {
    const upper = code.toUpperCase();

    // 1. In-memory cache hit
    const cached = this.codeCache.get(upper);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 2. Deduplicate concurrent calls for the same code
    const pending = this.pendingLookups.get(upper);
    if (pending) {
      try {
        return await pending;
      } catch {
        // If the shared promise failed, fall through to a fresh attempt
      }
    }

    // 3. Fetch from DB
    const promise = this.prisma.currency.findUnique({ where: { code: upper } });
    this.pendingLookups.set(upper, promise);

    try {
      const result = await promise;
      if (result) {
        this.codeCache.set(upper, { data: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
      }
      return result;
    } finally {
      this.pendingLookups.delete(upper);
    }
  }

  /** Create a new currency */
  async create(dto: CreateCurrencyDto) {
    const code = dto.code.toUpperCase();

    // Check for duplicate code
    const existing = await this.prisma.currency.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Currency with code "${code}" already exists`);
    }

    // If setting as base, clear any existing base
    if (dto.isBase) {
      await this.clearBaseFlag();
    }

    // If setting as default, clear any existing default
    if (dto.isDefault) {
      await this.clearDefaultFlag();
    }

    const created = await this.prisma.currency.create({
      data: {
        code,
        symbol: dto.symbol,
        name: dto.name,
        exchangeRate: dto.exchangeRate ?? 1,
        decimals: dto.decimals ?? 2,
        isDefault: dto.isDefault ?? false,
        isBase: dto.isBase ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    this.invalidateCache();
    return created;
  }

  /** Update a currency */
  async update(id: string, dto: UpdateCurrencyDto) {
    const currency = await this.getById(id);

    // If changing code, check for duplicates
    if (dto.code && dto.code.toUpperCase() !== currency.code) {
      const dup = await this.prisma.currency.findUnique({
        where: { code: dto.code.toUpperCase() },
      });
      if (dup) {
        throw new ConflictException(`Currency with code "${dto.code.toUpperCase()}" already exists`);
      }
    }

    // If setting as base, clear existing base flag
    if (dto.isBase && !currency.isBase) {
      await this.clearBaseFlag();
    }

    // If setting as default, clear existing default flag
    if (dto.isDefault && !currency.isDefault) {
      await this.clearDefaultFlag();
    }

    const updated = await this.prisma.currency.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.symbol !== undefined && { symbol: dto.symbol }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.exchangeRate !== undefined && { exchangeRate: dto.exchangeRate }),
        ...(dto.decimals !== undefined && { decimals: dto.decimals }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isBase !== undefined && { isBase: dto.isBase }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    this.invalidateCache();
    return updated;
  }

  /** Soft-delete (deactivate) a currency */
  async deactivate(id: string) {
    const currency = await this.getById(id);

    if (currency.isBase) {
      throw new BadRequestException('Cannot deactivate the base currency. Set another currency as base first.');
    }
    if (currency.isDefault) {
      throw new BadRequestException('Cannot deactivate the default display currency. Set another default first.');
    }

    const deactivated = await this.prisma.currency.update({
      where: { id },
      data: { isActive: false },
    });
    this.invalidateCache();
    return deactivated;
  }

  /**
   * Convert an amount from one currency to another using stored exchange rates.
   * Throws BusinessError when a currency is missing or its exchange rate is invalid.
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<{ amount: number; currency: string }> {
    if (fromCurrency === toCurrency) {
      return { amount, currency: toCurrency };
    }

    const from = await this.getByCode(fromCurrency);
    const to = await this.getByCode(toCurrency);

    if (!from || !to) {
      throw new BusinessError(
        'CURRENCY_NOT_FOUND',
        `Cannot convert: one of "${fromCurrency}" or "${toCurrency}" was not found in the exchange rate table.`,
      );
    }

    const fromRate = Number(from.exchangeRate);
    const toRate = Number(to.exchangeRate);

    if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
      throw new BusinessError(
        'CURRENCY_INVALID_RATE',
        `Cannot convert from "${fromCurrency}" to "${toCurrency}": exchange rate is missing or invalid.`,
      );
    }

    const convertedAmount = amount * (toRate / fromRate);
    const decimals = to.decimals ?? 2;
    const multiplier = Math.pow(10, decimals);
    const rounded = Math.round(convertedAmount * multiplier) / multiplier;

    return { amount: rounded, currency: toCurrency };
  }

  /**
   * Build a full PricingBreakdown from a supplier quote amount.
   *
   * This is the ONLY method that should be used to produce pricing for
   * customer-facing pages. It ensures:
   *   - supplierPrice is the raw provider amount
   *   - displayPrice is converted to the user's selected currency
   *   - chargePrice is the actual payment amount (may differ)
   *   - An exchange rate snapshot is captured for audit
   *
   * For MVP, chargeCurrency defaults to supplierCurrency (the gateway
   * charges in the provider's currency). This can be overridden when
   * payment gateway rules require a different charge currency.
   */
  async buildPricingBreakdown(
    input: BuildPricingBreakdownInput,
  ): Promise<PricingBreakdown> {
    const {
      supplierAmount,
      supplierCurrency,
      displayCurrency,
      chargeCurrency: chargeCurrencyInput,
    } = input;

    const chargeCurrency = chargeCurrencyInput ?? supplierCurrency;
    const normalizedSupplier = supplierCurrency.toUpperCase();
    const normalizedDisplay = displayCurrency.toUpperCase();
    const normalizedCharge = chargeCurrency.toUpperCase();

    const supplierPrice: Money = {
      amount: supplierAmount,
      currency: normalizedSupplier,
    };

    // Build display price (what the user sees)
    let displayPrice: Money;
    let exchangeRateSnapshot: ExchangeRateSnapshot | undefined;

    if (normalizedSupplier === normalizedDisplay) {
      displayPrice = { amount: supplierAmount, currency: normalizedDisplay };
    } else {
      const converted = await this.convert(
        supplierAmount,
        normalizedSupplier,
        normalizedDisplay,
      );
      displayPrice = { amount: converted.amount, currency: normalizedDisplay };

      // Capture the exchange rate snapshot for audit
      const fromCurr = await this.getByCode(normalizedSupplier);
      const toCurr = await this.getByCode(normalizedDisplay);
      if (fromCurr && toCurr) {
        const fromRate = Number(fromCurr.exchangeRate);
        const toRate = Number(toCurr.exchangeRate);
        if (fromRate > 0 && toRate > 0) {
          exchangeRateSnapshot = {
            fromCurrency: normalizedSupplier,
            toCurrency: normalizedDisplay,
            rate: toRate / fromRate,
            source: 'admin', // rates come from admin-managed currency table
            capturedAt: new Date().toISOString(),
          };
        }
      }
    }

    // Build charge price (what the payment gateway actually charges)
    let chargePrice: Money;
    if (normalizedCharge === normalizedSupplier) {
      chargePrice = { amount: supplierAmount, currency: normalizedCharge };
    } else if (normalizedCharge === normalizedDisplay) {
      chargePrice = { ...displayPrice };
    } else {
      const convertedCharge = await this.convert(
        supplierAmount,
        normalizedSupplier,
        normalizedCharge,
      );
      chargePrice = {
        amount: convertedCharge.amount,
        currency: normalizedCharge,
      };
    }

    return {
      supplierPrice,
      displayPrice,
      chargePrice,
      exchangeRateSnapshot,
    };
  }

  /**
   * Resolve the correct decimal places for a currency from the admin-configured
   * `Currency.decimals` field. This is the ONLY source of truth for currency
   * minor units — never hardcode a currency→decimals map elsewhere. Falls back
   * to 2 only when the currency isn't found (matches ISO 4217 default).
   */
  async getDecimals(code: string): Promise<number> {
    const currency = await this.getByCode(code);
    return currency?.decimals ?? 2;
  }

  /**
   * Convert an amount to the currency's smallest unit (e.g. cents, fils) using
   * the admin-configured decimals. Used by payment gateways to compute the
   * actual charge amount — getting this wrong means overcharging/undercharging
   * by a power of 10.
   */
  async toSmallestUnit(amount: number, currencyCode: string): Promise<number> {
    const decimals = await this.getDecimals(currencyCode);
    // Integer arithmetic to avoid floating-point edge cases (1.005 * 100 = 100.4999...)
    const [whole, fraction = ''] = amount.toFixed(decimals).split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    return Number(whole) * Math.pow(10, decimals) + Number(paddedFraction);
  }

  /** Inverse of toSmallestUnit — convert a minor-unit integer back to a standard amount. */
  async fromSmallestUnit(minorAmount: number, currencyCode: string): Promise<number> {
    const decimals = await this.getDecimals(currencyCode);
    return minorAmount / Math.pow(10, decimals);
  }

  /** Format an amount as a display string with the currency's correct decimal places (no code suffix). */
  async formatAmount(amount: number, currencyCode: string): Promise<string> {
    const decimals = await this.getDecimals(currencyCode);
    return amount.toFixed(decimals);
  }

  /** Format an amount with the currency code appended, e.g. "256.600 KWD". */
  async formatWithCode(amount: number, currencyCode: string): Promise<string> {
    const code = currencyCode.toUpperCase();
    return `${await this.formatAmount(amount, code)} ${code}`;
  }

  /** Hard-delete (admin only — use with caution) */
  async delete(id: string) {
    const currency = await this.getById(id);

    if (currency.isBase) {
      throw new BadRequestException('Cannot delete the base currency. Set another currency as base first.');
    }
    if (currency.isDefault) {
      throw new BadRequestException('Cannot delete the default display currency. Set another default first.');
    }

    const deleted = await this.prisma.currency.delete({ where: { id } });
    this.invalidateCache();
    return deleted;
  }

  /** Set a currency as the default display currency */
  async setAsDefault(id: string) {
    await this.getById(id);
    await this.clearDefaultFlag();
    const updated = await this.prisma.currency.update({
      where: { id },
      data: { isDefault: true },
    });
    this.invalidateCache();
    return updated;
  }

  /** Set a currency as the base (rate = 1) currency */
  async setAsBase(id: string) {
    const currency = await this.getById(id);

    // Get the current base currency rate for recalculation
    const currentBase = await this.prisma.currency.findFirst({ where: { isBase: true } });

    await this.clearBaseFlag();

    // If there was a previous base, recalculate all rates relative to the new base
    if (currentBase && currentBase.id !== id) {
      await this.recalculateRates(currency);
    }

    const updated = await this.prisma.currency.update({
      where: { id },
      data: { isBase: true, exchangeRate: 1 },
    });
    this.invalidateCache();
    return updated;
  }

  // ─── Private helpers ────────────────────────────────────────

  private async clearBaseFlag() {
    await this.prisma.currency.updateMany({
      where: { isBase: true },
      data: { isBase: false },
    });
  }

  private async clearDefaultFlag() {
    await this.prisma.currency.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  /** When the base currency changes, recalculate all rates so they stay relative to the new base */
  private async recalculateRates(newBase: { id: string; exchangeRate: any }) {
    const allCurrencies = await this.prisma.currency.findMany({
      where: { isActive: true, id: { not: newBase.id } },
    });

    // Independent rows — update in parallel (was serial await per currency).
    await Promise.all(
      allCurrencies.map((currency) => {
        // rate_new_base = old_rate / new_base_rate
        // Example: old base = KWD (rate=1), new base = USD (rate=3.25 from KWD's perspective)
        // EUR had rate 0.92 relative to KWD → new EUR rate = 0.92 / 3.25 = 0.283... relative to USD
        const newRate = Number(currency.exchangeRate) / Number(newBase.exchangeRate);
        return this.prisma.currency.update({
          where: { id: currency.id },
          data: { exchangeRate: newRate },
        });
      }),
    );
  }
}
