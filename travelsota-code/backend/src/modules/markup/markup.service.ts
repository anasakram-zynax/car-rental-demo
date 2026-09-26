import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { CurrencyService } from '../currency/application/services/currency.service';

export interface MarkupRuleEntity {
  id: string;
  name: string;
  type: 'global' | 'agent' | 'supplier' | 'product' | 'route';
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  /** Currency markupValue is denominated in — only meaningful for 'fixed'
   *  rules (percentage rules are currency-agnostic). Null = legacy/unset. */
  currency: string | null;
  priority: number;
  agentId: string | null;
  supplierId: string | null;
  sourceTemplateId?: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarkupRuleInput {
  name: string;
  type: 'global' | 'agent' | 'supplier' | 'product' | 'route';
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  currency?: string | null;
  priority?: number;
  agentId?: string | null;
  supplierId?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface PricePreviewInput {
  basePrice: number;
  productType: 'flights' | 'hotels' | 'packages';
  agentId?: string;
  supplierId?: string;
  routeFrom?: string;
  routeTo?: string;
  /** Currency basePrice is in — when supplied, fixed-amount rules in a
   *  different currency are converted before being applied. */
  targetCurrency?: string;
}

export interface PricePreviewResult {
  basePrice: number;
  appliedRules: { rule: MarkupRuleEntity; markupAmount: number }[];
  finalPrice: number;
  effectiveMarkupPercent: number;
}

/** Pre-loaded rules for batch markup calculation — avoids per-hotel DB queries */
export interface PreloadedMarkupRules {
  rules: MarkupRuleEntity[];
  loadedAt: number;
}

/** Shape of one rule inside MarkupTemplate.rules (Json column). */
interface TemplateRuleDef {
  name?: string;
  applyTo?: 'flights' | 'hotels' | 'packages' | 'all';
  markupType?: 'percentage' | 'fixed';
  markupValue?: number;
  currency?: string | null;
  priority?: number;
  routeFrom?: string | null;
  routeTo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@Injectable()
export class MarkupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Build a lookup of "1 unit of X converts to how many units of targetCurrency"
   * for every active currency, resolved ONCE (CurrencyService caches Currency
   * rows in-memory) so fixed-amount markup rules in a different currency than
   * the offer can be converted without a query per rule.
   */
  async buildCurrencyRateMap(targetCurrency: string): Promise<Map<string, number>> {
    const currencies = await this.prisma.currency.findMany({ where: { isActive: true } });
    const target = currencies.find((c) => c.code === targetCurrency);
    const targetRate = target ? Number(target.exchangeRate) : 1;
    const map = new Map<string, number>();
    for (const c of currencies) {
      const rate = Number(c.exchangeRate);
      if (rate > 0 && targetRate > 0) map.set(c.code, targetRate / rate);
    }
    return map;
  }

  /** Calculate the final price by applying all matching markup rules in priority order */
  async calculatePrice(
    basePrice: number,
    productType: 'flights' | 'hotels' | 'packages',
    agentId?: string,
    supplierId?: string,
    routeFrom?: string,
    routeTo?: string,
    targetCurrency?: string,
  ): Promise<PricePreviewResult> {
    const rules = await this.findMatchingRules(
      productType,
      agentId,
      supplierId,
      routeFrom,
      routeTo,
    );

    const profileFallback = await this.getProfileMarkupFallback(agentId, productType, rules.length);
    const rateMap = targetCurrency ? await this.buildCurrencyRateMap(targetCurrency) : undefined;
    return this.applyRules(basePrice, rules, profileFallback, targetCurrency, rateMap);
  }

  /**
   * Profile-level markup fallback for an agent (used when no explicit rules
   * match). Extracted so calculatePriceWithRules (bulk path) can honor the
   * agent profile's hotelMarkup/flightMarkup too — unified pipeline Phase 2.
   */
  async getProfileMarkupFallback(
    agentId: string | null | undefined,
    productType: 'flights' | 'hotels' | 'packages',
    matchedRuleCount: number,
  ): Promise<number> {
    if (!agentId || matchedRuleCount > 0) return 0;
    try {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { id: agentId },
        select: { flightMarkup: true, hotelMarkup: true },
      });
      if (!profile) return 0;
      if (productType === 'flights') return Number(profile.flightMarkup ?? 0);
      if (productType === 'hotels') return Number(profile.hotelMarkup ?? 0);
      return 0;
    } catch {
      // Silently ignore profile lookup errors
      return 0;
    }
  }

  /**
   * Pre-load all active markup rules for a product type.
   * Use with calculatePriceWithRules() to avoid per-hotel DB queries.
   */
  async preloadRules(productType: string): Promise<PreloadedMarkupRules> {
    const now = new Date();
    const rules = await this.prisma.markupRule.findMany({
      where: {
        isActive: true,
        applyTo: { in: [productType, 'all'] },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: { priority: 'asc' },
    });
    return {
      rules: rules.map((r) => this.toEntity(r)),
      loadedAt: Date.now(),
    };
  }

  /**
   * Calculate price using pre-loaded rules — zero DB queries.
   * Filters the preloaded rules in memory for the specific agent/supplier/route.
   *
   * `targetCurrency`/`rateMap`: optional — when a fixed-amount rule's own
   * currency differs from `targetCurrency`, its markupValue is converted via
   * `rateMap` before being added. Build `rateMap` ONCE per batch with
   * `buildCurrencyRateMap()` (outside any per-item loop) and pass it through;
   * omitting both keeps this a zero-DB, zero-conversion call exactly as before.
   */
  calculatePriceWithRules(
    basePrice: number,
    preloaded: PreloadedMarkupRules,
    agentId?: string,
    supplierId?: string,
    routeFrom?: string,
    routeTo?: string,
    targetCurrency?: string,
    rateMap?: Map<string, number>,
  ): PricePreviewResult {
    const rules = preloaded.rules.filter((rule) => {
      if (rule.type === 'agent') {
        if (!agentId || rule.agentId !== agentId) return false;
      }
      if (rule.type === 'supplier') {
        if (!supplierId || rule.supplierId !== supplierId) return false;
      }
      if (rule.type === 'route') {
        if (!routeFrom || !routeTo) return false;
        if (rule.routeFrom && rule.routeFrom !== routeFrom) return false;
        if (rule.routeTo && rule.routeTo !== routeTo) return false;
      }
      return true;
    });
    return this.applyRules(basePrice, rules, 0, targetCurrency, rateMap);
  }

  /**
   * calculatePriceWithRules with the agent profile-level fallback applied.
   * The bulk variant above cannot await the profile lookup (per-call DB hit),
   * so callers that need agent pricing resolve the fallback ONCE and pass it
   * in here. Keeps one source of truth for rule matching + fallback math.
   */
  calculatePriceWithRulesForAgent(
    basePrice: number,
    preloaded: PreloadedMarkupRules,
    agentId: string | null | undefined,
    profileFallback: number,
    supplierId?: string,
    routeFrom?: string,
    routeTo?: string,
    targetCurrency?: string,
    rateMap?: Map<string, number>,
  ): PricePreviewResult {
    const rules = preloaded.rules.filter((rule) => {
      if (rule.type === 'agent') {
        if (!agentId || rule.agentId !== agentId) return false;
      }
      if (rule.type === 'supplier') {
        if (!supplierId || rule.supplierId !== supplierId) return false;
      }
      if (rule.type === 'route') {
        if (!routeFrom || !routeTo) return false;
        if (rule.routeFrom && rule.routeFrom !== routeFrom) return false;
        if (rule.routeTo && rule.routeTo !== routeTo) return false;
      }
      return true;
    });
    return this.applyRules(basePrice, rules, profileFallback, targetCurrency, rateMap);
  }

  private applyRules(
    basePrice: number,
    rules: MarkupRuleEntity[],
    profileFallback: number = 0,
    targetCurrency?: string,
    rateMap?: Map<string, number>,
  ): PricePreviewResult {
    let totalMarkup = 0;
    const appliedRules: { rule: MarkupRuleEntity; markupAmount: number }[] = [];

    for (const rule of rules) {
      let markupAmount = 0;
      if (rule.markupType === 'percentage') {
        markupAmount = basePrice * (rule.markupValue / 100);
      } else if (rule.markupType === 'fixed') {
        // A fixed markup is denominated in rule.currency. If the caller told
        // us what currency the offer is actually priced in (targetCurrency)
        // and supplied a rate map, convert — otherwise fall back to adding
        // the raw value (the old, currency-ambiguous behavior, unchanged for
        // callers that don't pass targetCurrency).
        if (rule.currency && targetCurrency && rule.currency !== targetCurrency && rateMap) {
          const rate = rateMap.get(rule.currency);
          markupAmount = rate != null ? rule.markupValue * rate : rule.markupValue;
        } else {
          markupAmount = rule.markupValue;
        }
      }
      totalMarkup += markupAmount;
      appliedRules.push({ rule, markupAmount });
    }

    // Profile fallback is stored as a percentage value, apply as basePrice * (fallback / 100)
    if (appliedRules.length === 0 && profileFallback > 0) {
      const fallbackAmount = basePrice * (profileFallback / 100);
      totalMarkup += fallbackAmount;
    }

    const finalPrice = basePrice + totalMarkup;
    const effectiveMarkupPercent =
      basePrice > 0 ? (totalMarkup / basePrice) * 100 : 0;

    return {
      basePrice,
      appliedRules,
      finalPrice,
      effectiveMarkupPercent: Math.round(effectiveMarkupPercent * 100) / 100,
    };
  }

  /** Get the effective markup % for display (without applying) */
  async getEffectiveMarkup(
    productType: 'flights' | 'hotels' | 'packages',
    agentId?: string,
    supplierId?: string,
    routeFrom?: string,
    routeTo?: string,
  ): Promise<{
    totalPercent: number;
    totalFixed?: number;
    rules: Pick<
      MarkupRuleEntity,
      'id' | 'name' | 'markupType' | 'markupValue' | 'priority'
    >[];
  }> {
    const rules = await this.findMatchingRules(
      productType,
      agentId,
      supplierId,
      routeFrom,
      routeTo,
    );

    // For display purposes, compute an approximate total markup as sum of percentages
    let totalPercent = 0;
    let totalFixed = 0;
    for (const rule of rules) {
      if (rule.markupType === 'percentage') {
        totalPercent += rule.markupValue;
      } else if (rule.markupType === 'fixed') {
        totalFixed += rule.markupValue;
      }
    }

    return {
      totalPercent,
      totalFixed: totalFixed > 0 ? totalFixed : undefined,
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        markupType: r.markupType,
        markupValue: r.markupValue,
        priority: r.priority,
      })),
    };
  }

  /** Preview what a price would be with the current markup rules */
  async preview(input: PricePreviewInput): Promise<PricePreviewResult> {
    return this.calculatePrice(
      input.basePrice,
      input.productType,
      input.agentId,
      input.supplierId,
      input.routeFrom,
      input.routeTo,
      input.targetCurrency,
    );
  }

  /** Find all markup rules assigned to a specific agent */
  async findByAgentId(agentId: string): Promise<MarkupRuleEntity[]> {
    const rules = await this.prisma.markupRule.findMany({
      where: { agentId, isActive: true },
      orderBy: { priority: 'asc' },
    });
    return rules.map((r) => this.toEntity(r));
  }

  /** Bulk assign or update agent-specific markup rules */
  async bulkAssignAgentMarkups(
    agentId: string,
    markups: {
      id?: string;
      name: string;
      applyTo: 'flights' | 'hotels' | 'packages' | 'all';
      markupType: 'percentage' | 'fixed';
      markupValue: number;
      routeFrom?: string;
      routeTo?: string;
    }[],
  ): Promise<MarkupRuleEntity[]> {
    // Deactivate existing agent-specific rules (soft-delete by setting inactive)
    await this.prisma.markupRule.updateMany({
      where: { agentId, type: 'agent' },
      data: { isActive: false },
    });

    const created: MarkupRuleEntity[] = [];
    for (let i = 0; i < markups.length; i++) {
      const m = markups[i];
      const rule = await this.prisma.markupRule.create({
        data: {
          name: m.name,
          type: 'agent',
          applyTo: m.applyTo,
          markupType: m.markupType,
          markupValue: m.markupValue,
          agentId,
          routeFrom: m.routeFrom ?? null,
          routeTo: m.routeTo ?? null,
          priority: 50 + i, // Agent markups applied after global, incremental ordering
          isActive: true,
        },
      });
      created.push(this.toEntity(rule));
    }

    return created;
  }

  // ── CRUD ──────────────────────────────────────────────────────

  async findAll(): Promise<MarkupRuleEntity[]> {
    const rules = await this.prisma.markupRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return rules.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<MarkupRuleEntity | null> {
    const rule = await this.prisma.markupRule.findUnique({ where: { id } });
    return rule ? this.toEntity(rule) : null;
  }

  async create(input: MarkupRuleInput): Promise<MarkupRuleEntity> {
    // Auto-assign priority to end if not specified
    const priority = input.priority ?? (await this.nextPriority(input.applyTo));

    const rule = await this.prisma.markupRule.create({
      data: {
        name: input.name,
        type: input.type,
        applyTo: input.applyTo,
        markupType: input.markupType,
        markupValue: input.markupValue,
        currency: input.currency ?? null,
        priority,
        agentId: input.agentId ?? null,
        supplierId: input.supplierId ?? null,
        routeFrom: input.routeFrom ?? null,
        routeTo: input.routeTo ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        isActive: input.isActive ?? true,
      },
    });
    return this.toEntity(rule);
  }

  async update(
    id: string,
    input: Partial<MarkupRuleInput>,
  ): Promise<MarkupRuleEntity> {
    const existing = await this.findById(id);
    if (!existing) throw new BusinessError('MARKUP_RULE_NOT_FOUND');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.applyTo !== undefined) data.applyTo = input.applyTo;
    if (input.markupType !== undefined) data.markupType = input.markupType;
    if (input.markupValue !== undefined) data.markupValue = input.markupValue;
    if (input.currency !== undefined) data.currency = input.currency ?? null;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.agentId !== undefined) data.agentId = input.agentId ?? null;
    if (input.supplierId !== undefined)
      data.supplierId = input.supplierId ?? null;
    if (input.routeFrom !== undefined) data.routeFrom = input.routeFrom ?? null;
    if (input.routeTo !== undefined) data.routeTo = input.routeTo ?? null;
    if (input.startDate !== undefined)
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.endDate !== undefined)
      data.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const rule = await this.prisma.markupRule.update({ where: { id }, data });
    return this.toEntity(rule);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new BusinessError('MARKUP_RULE_NOT_FOUND');
    await this.prisma.markupRule.delete({ where: { id } });
  }

  async toggleActive(id: string): Promise<MarkupRuleEntity> {
    const existing = await this.findById(id);
    if (!existing) throw new BusinessError('MARKUP_RULE_NOT_FOUND');
    const rule = await this.prisma.markupRule.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
    return this.toEntity(rule);
  }

  /** Reorder priorities: pass array of { id, priority } pairs */
  async reorder(items: { id: string; priority: number }[]): Promise<void> {
    for (const item of items) {
      await this.prisma.markupRule.update({
        where: { id: item.id },
        data: { priority: item.priority },
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async findMatchingRules(
    productType: string,
    agentId?: string,
    supplierId?: string,
    routeFrom?: string,
    routeTo?: string,
  ): Promise<MarkupRuleEntity[]> {
    const now = new Date();

    // Build a broad query — Prisma will return all potentially matching rules
    const rules = await this.prisma.markupRule.findMany({
      where: {
        isActive: true,
        applyTo: { in: [productType, 'all'] },
        AND: [
          // Date range filter
          {
            OR: [{ startDate: null }, { startDate: { lte: now } }],
          },
          {
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    // Filter in-memory for complex conditions
    return rules
      .filter((rule) => {
        // Agent-specific rules: match only if agentId matches
        if (rule.type === 'agent') {
          if (!agentId || rule.agentId !== agentId) return false;
        }
        // Supplier-specific rules
        if (rule.type === 'supplier') {
          if (!supplierId || rule.supplierId !== supplierId) return false;
        }
        // Route-specific rules
        if (rule.type === 'route') {
          if (!routeFrom || !routeTo) return false;
          if (rule.routeFrom && rule.routeFrom !== routeFrom) return false;
          if (rule.routeTo && rule.routeTo !== routeTo) return false;
        }
        return true;
      })
      .map((r) => this.toEntity(r));
  }

  private async nextPriority(applyTo: string): Promise<number> {
    const last = await this.prisma.markupRule.findFirst({
      where: { applyTo },
      orderBy: { priority: 'desc' },
      select: { priority: true },
    });
    return (last?.priority ?? 0) + 10;
  }

  private toEntity(r: any): MarkupRuleEntity {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      applyTo: r.applyTo,
      markupType: r.markupType,
      markupValue: Number(r.markupValue),
      currency: r.currency ?? null,
      priority: r.priority,
      agentId: r.agentId ?? null,
      supplierId: r.supplierId ?? null,
      sourceTemplateId: r.sourceTemplateId ?? null,
      routeFrom: r.routeFrom ?? null,
      routeTo: r.routeTo ?? null,
      startDate: r.startDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Markup Templates
  // ═══════════════════════════════════════════════════════════════

  async createTemplate(data: {
    name: string;
    description?: string;
    rules: any[];
    createdBy?: string;
  }) {
    return this.prisma.markupTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        rules: data.rules,
        createdBy: data.createdBy,
      },
    });
  }

  async listTemplates() {
    return this.prisma.markupTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: string) {
    return this.prisma.markupTemplate.findUnique({ where: { id } });
  }

  async updateTemplate(
    id: string,
    data: { name?: string; description?: string; rules?: any[] },
  ) {
    return this.prisma.markupTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    return this.prisma.markupTemplate.delete({ where: { id } });
  }

  /**
   * Apply a template by creating new MarkupRules from its rules.
   *
   * Option B semantics (locked):
   * - Template rules carry their own `applyTo` ('flights'|'hotels'|'packages'|'all').
   * - Supplier scope: rules whose applyTo doesn't match the supplier's product
   *   type are SKIPPED; matching + 'all' rules are copied with applyTo forced
   *   to the supplier's product type.
   * - Agent/global scope: not single-product → ALL rules copy, each keeping
   *   its own applyTo (rule-level scoping happens at search time).
   * - Re-apply is idempotent: prior rules created from this template in the
   *   same scope are replaced (sourceTemplateId provenance).
   */ async applyTemplate(
    templateId: string,
    scope: { supplierId?: string; agentId?: string; applyTo?: string },
  ) {
    const template = await this.prisma.markupTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new BusinessError(
        'MARKUP_TEMPLATE_NOT_FOUND',
        'Markup template not found.',
      );
    }

    const templateRules = ((template.rules ?? []) as TemplateRuleDef[]).filter(
      (r): r is TemplateRuleDef => !!r,
    );
    if (templateRules.length === 0) {
      throw new BusinessError(
        'MARKUP_TEMPLATE_EMPTY',
        'Template has no rules to apply.',
      );
    }

    // Resolve the supplier's product type from its ProviderConfig module
    // ('hotels' | 'flights'). Unknown supplier → explicit error, no guessing.
    let productType: 'hotels' | 'flights' | null = null;
    if (scope.supplierId) {
      const cfg = await this.prisma.providerConfig.findFirst({
        where: {
          provider: scope.supplierId,
          module: { in: ['hotels', 'flights'] },
        },
        select: { module: true },
      });
      if (!cfg) {
        throw new BusinessError(
          'MARKUP_UNKNOWN_SUPPLIER',
          `Unknown supplier "${scope.supplierId}" — no flights/hotels provider config exists.`,
        );
      }
      productType = cfg.module as 'hotels' | 'flights';
    }

    const applicable = productType
      ? templateRules.filter((r) => {
          const a = r.applyTo ?? 'all';
          return a === 'all' || a === productType;
        })
      : templateRules;

    if (productType && applicable.length === 0) {
      throw new BusinessError(
        'MARKUP_TEMPLATE_NO_MATCHING_RULES',
        `Template "${template.name}" has no rules applicable to a ${productType} supplier.`,
        undefined,
        { templateName: template.name, productType },
      );
    }

    const type = scope.agentId
      ? 'agent'
      : scope.supplierId
        ? 'supplier'
        : 'global';
    // Replace only this template's copies within the same scope (global scope
    // is agentId=null AND supplierId=null so other scopes are untouched).
    const scopeWhere = scope.agentId
      ? { agentId: scope.agentId }
      : scope.supplierId
        ? { supplierId: scope.supplierId }
        : { agentId: null, supplierId: null };
    const skipped = templateRules.length - applicable.length;

    await this.prisma.$transaction(async (tx) => {
      await tx.markupRule.deleteMany({
        where: { sourceTemplateId: template.id, ...scopeWhere },
      });
      for (const rule of applicable) {
        await tx.markupRule.create({
          data: {
            name: rule.name ?? template.name,
            type,
            applyTo: productType ?? scope.applyTo ?? rule.applyTo ?? 'all',
            markupType: rule.markupType ?? 'percentage',
            markupValue: rule.markupValue ?? 0,
            currency: rule.currency ?? null,
            priority: rule.priority ?? 0,
            agentId: scope.agentId ?? null,
            supplierId: scope.supplierId ?? null,
            sourceTemplateId: template.id,
            routeFrom: rule.routeFrom ?? null,
            routeTo: rule.routeTo ?? null,
            startDate: rule.startDate ? new Date(rule.startDate) : null,
            endDate: rule.endDate ? new Date(rule.endDate) : null,
            isActive: true,
          },
        });
      }
    });

    return {
      template,
      rulesCreated: applicable.length,
      rulesSkipped: skipped,
      ...(productType ? { productType } : {}),
    };
  }
}
