import { Test } from '@nestjs/testing';
import { MarkupService, type MarkupRuleEntity } from './markup.service';
import { PrismaService } from '../../shared/database/prisma.service';

describe('MarkupService', () => {
  let service: MarkupService;
  let prisma: jest.Mocked<PrismaService>;

  const mockRule = (overrides: Partial<MarkupRuleEntity> = {}): MarkupRuleEntity => ({
    id: 'rule-1',
    name: 'Test Rule',
    type: 'global',
    applyTo: 'flights',
    markupType: 'percentage',
    markupValue: 10,
    priority: 10,
    agentId: null,
    supplierId: null,
    routeFrom: null,
    routeTo: null,
    startDate: null,
    endDate: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockDbRule = (overrides: any = {}) => ({
    id: 'rule-1',
    name: 'Test Rule',
    type: 'global',
    applyTo: 'flights',
    markupType: 'percentage',
    markupValue: 10,
    priority: 10,
    agentId: null,
    supplierId: null,
    routeFrom: null,
    routeTo: null,
    startDate: null,
    endDate: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      markupRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      agentProfile: {
        findUnique: jest.fn(),
      },
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        MarkupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MarkupService>(MarkupService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calculatePrice', () => {
    it('returns base price when no rules match and no profile fallback', async () => {
      prisma.markupRule.findMany.mockResolvedValue([]);

      const result = await service.calculatePrice(1000, 'flights');

      expect(result.basePrice).toBe(1000);
      expect(result.finalPrice).toBe(1000);
      expect(result.appliedRules).toEqual([]);
      expect(result.effectiveMarkupPercent).toBe(0);
    });

    it('applies additive percentage markups (F1: no compounding)', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: 'Global 10%', markupValue: 10, priority: 10 }),
        mockDbRule({ name: 'Route 5%', markupValue: 5, priority: 20 }),
      ]);

      const result = await service.calculatePrice(1000, 'flights');

      // Additive: 10% + 5% = 15% of base (1000) = 150 markup, final = 1150
      // NOT compound: 10% of 1000 = 100 → 1100, then 5% of 1100 = 55 → 1155
      expect(result.finalPrice).toBe(1150);
      expect(result.appliedRules).toHaveLength(2);
      expect(result.appliedRules[0].markupAmount).toBe(100);
      expect(result.appliedRules[1].markupAmount).toBe(50);
      expect(result.effectiveMarkupPercent).toBe(15);
    });

    it('applies rules in priority order', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: 'First', markupValue: 20, priority: 1 }),
        mockDbRule({ name: 'Second', markupValue: 5, priority: 5 }),
      ]);

      const result = await service.calculatePrice(1000, 'flights');

      expect(result.appliedRules[0].rule.name).toBe('First');
      expect(result.appliedRules[1].rule.name).toBe('Second');
      expect(result.finalPrice).toBe(1250); // 20% + 5% = 25%
    });

    it('returns base price unchanged with 0% markup', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ markupValue: 0 }),
      ]);

      const result = await service.calculatePrice(500, 'flights');

      expect(result.finalPrice).toBe(500);
      expect(result.effectiveMarkupPercent).toBe(0);
    });

    it('applies profile fallback as percentage of basePrice when no rules matched (F2)', async () => {
      prisma.markupRule.findMany.mockResolvedValue([]);
      prisma.agentProfile.findUnique.mockResolvedValue({
        flightMarkup: 15,
        hotelMarkup: 10,
      } as any);

      const result = await service.calculatePrice(1000, 'flights', 'agent-1');

      // 15% of 1000 = 150 markup
      expect(result.finalPrice).toBe(1150);
      expect(result.appliedRules).toHaveLength(0);
      expect(result.effectiveMarkupPercent).toBe(15);
    });

    it('applies hotel profile fallback for hotel product type', async () => {
      prisma.markupRule.findMany.mockResolvedValue([]);
      prisma.agentProfile.findUnique.mockResolvedValue({
        flightMarkup: 15,
        hotelMarkup: 10,
      } as any);

      const result = await service.calculatePrice(500, 'hotels', 'agent-1');

      expect(result.finalPrice).toBe(550); // 10% of 500 = 50
    });

    it('does not apply profile fallback when rules exist', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: 'Global', markupValue: 5 }),
      ]);
      // Would have fallback but rules exist so it's skipped
      prisma.agentProfile.findUnique.mockResolvedValue({
        flightMarkup: 20,
        hotelMarkup: 10,
      } as any);

      const result = await service.calculatePrice(1000, 'flights', 'agent-1');

      expect(result.finalPrice).toBe(1050); // only 5% from rule, not 20% fallback
      expect(result.appliedRules).toHaveLength(1);
    });

    it('silently handles profile lookup error', async () => {
      prisma.markupRule.findMany.mockResolvedValue([]);
      prisma.agentProfile.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.calculatePrice(1000, 'flights', 'agent-1');

      expect(result.finalPrice).toBe(1000);
      expect(result.appliedRules).toHaveLength(0);
    });

    it('skips fixed-type rules by producing 0 markup (F3)', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: 'Percentage', markupValue: 10, markupType: 'percentage' }),
        mockDbRule({ name: 'Fixed legacy', markupValue: 50, markupType: 'fixed' }),
      ]);

      const result = await service.calculatePrice(1000, 'flights');

      // percentage rule: 100, fixed rule: 0
      expect(result.finalPrice).toBe(1100);
      expect(result.appliedRules).toHaveLength(2);
      expect(result.appliedRules[0].markupAmount).toBe(100);
      expect(result.appliedRules[1].markupAmount).toBe(0);
    });

    it('filters by product type correctly', async () => {
      prisma.markupRule.findMany.mockImplementation((args: any) => {
        const applyToIn = args?.where?.applyTo?.in ?? [];
        return Promise.resolve(
          applyToIn.includes('flights') ? [mockDbRule({ applyTo: 'flights' })] : [],
        );
      });

      const flights = await service.calculatePrice(1000, 'flights');
      const hotels = await service.calculatePrice(1000, 'hotels');

      expect(flights.finalPrice).toBe(1100);
      expect(hotels.finalPrice).toBe(1000);
    });

    it('applies "all" applyTo to any product type', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ applyTo: 'all' }),
      ]);

      const flights = await service.calculatePrice(1000, 'flights');
      const hotels = await service.calculatePrice(1000, 'hotels');

      expect(flights.finalPrice).toBe(1100);
      expect(hotels.finalPrice).toBe(1100);
    });

    it('filters by route matching', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ type: 'route', routeFrom: 'JFK', routeTo: 'LHR' }),
        mockDbRule({ type: 'route', routeFrom: 'JFK', routeTo: 'DXB' }),
      ]);

      const match = await service.calculatePrice(1000, 'flights', undefined, undefined, 'JFK', 'LHR');
      const noMatch = await service.calculatePrice(1000, 'flights', undefined, undefined, 'JFK', 'CDG');

      expect(match.finalPrice).toBe(1100);
      expect(match.appliedRules).toHaveLength(1);
      expect(noMatch.finalPrice).toBe(1000);
      expect(noMatch.appliedRules).toHaveLength(0);
    });
  });

  describe('getEffectiveMarkup', () => {
    it('sums percentage rules and skips fixed rules', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: '10%', markupValue: 10, markupType: 'percentage' }),
        mockDbRule({ name: 'Fixed', markupValue: 50, markupType: 'fixed' }),
      ]);

      const result = await service.getEffectiveMarkup('flights');

      expect(result.totalPercent).toBe(10);
      expect(result.rules).toHaveLength(2);
    });
  });

  describe('bulkAssignAgentMarkups', () => {
    it('assigns incremental priorities starting from 50 (F8)', async () => {
      prisma.markupRule.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.markupRule.create
        .mockResolvedValueOnce(mockDbRule({ name: 'First', id: 'new-1' }))
        .mockResolvedValueOnce(mockDbRule({ name: 'Second', id: 'new-2' }))
        .mockResolvedValueOnce(mockDbRule({ name: 'Third', id: 'new-3' }));

      await service.bulkAssignAgentMarkups('agent-1', [
        { name: 'First', applyTo: 'flights', markupType: 'percentage', markupValue: 5 },
        { name: 'Second', applyTo: 'flights', markupType: 'percentage', markupValue: 10 },
        { name: 'Third', applyTo: 'flights', markupType: 'percentage', markupValue: 15 },
      ]);

      expect(prisma.markupRule.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ name: 'First', priority: 50 }),
      }));
      expect(prisma.markupRule.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ name: 'Second', priority: 51 }),
      }));
      expect(prisma.markupRule.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
        data: expect.objectContaining({ name: 'Third', priority: 52 }),
      }));
    });

    it('deactivates existing agent-specific rules first', async () => {
      prisma.markupRule.updateMany.mockResolvedValue({ count: 2 } as any);
      prisma.markupRule.create.mockResolvedValue(mockDbRule({}));

      await service.bulkAssignAgentMarkups('agent-1', [
        { name: 'New', applyTo: 'flights', markupType: 'percentage', markupValue: 10 },
      ]);

      expect(prisma.markupRule.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', type: 'agent' },
        data: { isActive: false },
      });
    });
  });

  describe('findMatchingRules', () => {
    it('filters by date range', async () => {
      const futureStart = new Date(Date.now() + 86400000);
      const pastStart = new Date(Date.now() - 86400000);
      const pastEnd = new Date(Date.now() - 1);

      prisma.markupRule.findMany.mockImplementation((args: any) => {
        const and = args?.where?.AND ?? [];
        const startOr = and[0]?.OR ?? [];
        const endOr = and[1]?.OR ?? [];
        const all: any[] = [
          { name: 'Active', startDate: pastStart, endDate: null },
          { name: 'Not started', startDate: futureStart, endDate: null },
          { name: 'Expired', startDate: pastStart, endDate: pastEnd },
        ];
        return Promise.resolve(
          all.filter((r) => {
            const startOk = startOr.length === 0 || startOr.some((c: any) =>
              r.startDate == null || (c.startDate?.lte && r.startDate <= c.startDate.lte),
            );
            const endOk = endOr.length === 0 || endOr.some((c: any) =>
              r.endDate == null || (c.endDate?.gte && r.endDate >= c.endDate.gte),
            );
            return startOk && endOk;
          }).map((r) => mockDbRule({ name: r.name, startDate: r.startDate, endDate: r.endDate })),
        );
      });

      const result = await service.calculatePrice(1000, 'flights');

      expect(result.appliedRules).toHaveLength(1);
      expect(result.appliedRules[0].rule.name).toBe('Active');
    });

    it('matches agent-specific rules only for the correct agent', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ type: 'agent', agentId: 'agent-1' }),
        mockDbRule({ type: 'agent', agentId: 'agent-2' }),
      ]);

      const match = await service.calculatePrice(1000, 'flights', 'agent-1');
      const noMatch = await service.calculatePrice(1000, 'flights', 'agent-3');

      expect(match.appliedRules).toHaveLength(1);
      expect(noMatch.appliedRules).toHaveLength(0);
    });
  });

  describe('CRUD', () => {
    it('lists all rules ordered by priority', async () => {
      prisma.markupRule.findMany.mockResolvedValue([
        mockDbRule({ name: 'First', priority: 10 }),
        mockDbRule({ name: 'Second', priority: 20 }),
      ]);

      const rules = await service.findAll();

      expect(rules).toHaveLength(2);
      expect(prisma.markupRule.findMany).toHaveBeenCalledWith({
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });
    });

    it('finds a rule by id', async () => {
      prisma.markupRule.findUnique.mockResolvedValue(mockDbRule({ id: 'rule-1' }));

      const rule = await service.findById('rule-1');

      expect(rule).not.toBeNull();
      expect(rule!.id).toBe('rule-1');
    });

    it('returns null for non-existent rule', async () => {
      prisma.markupRule.findUnique.mockResolvedValue(null);

      const rule = await service.findById('nope');
      expect(rule).toBeNull();
    });

    it('auto-assigns priority on create', async () => {
      prisma.markupRule.findFirst.mockResolvedValue({ priority: 30 } as any);
      prisma.markupRule.create.mockResolvedValue(mockDbRule({ priority: 40 }));

      await service.create({
        name: 'New Rule',
        type: 'global',
        applyTo: 'flights',
        markupType: 'percentage',
        markupValue: 5,
      });

      expect(prisma.markupRule.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ priority: 40 }),
      }));
    });

    it('throws on update of non-existent rule', async () => {
      prisma.markupRule.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'new' })).rejects.toThrow();
    });

    it('toggles rule active state', async () => {
      prisma.markupRule.findUnique.mockResolvedValue(mockDbRule({ isActive: false } as any));
      prisma.markupRule.update.mockResolvedValue(mockDbRule({ isActive: true } as any));

      const result = await service.toggleActive('rule-1');
      expect(prisma.markupRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { isActive: true },
      });
    });

    it('reorders priorities', async () => {
      prisma.markupRule.update.mockResolvedValue(mockDbRule());

      await service.reorder([
        { id: 'rule-1', priority: 1 },
        { id: 'rule-2', priority: 2 },
      ]);

      expect(prisma.markupRule.update).toHaveBeenCalledTimes(2);
      expect(prisma.markupRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { priority: 1 },
      });
    });

    it('deletes a rule', async () => {
      prisma.markupRule.findUnique.mockResolvedValue(mockDbRule());
      prisma.markupRule.delete.mockResolvedValue(mockDbRule());

      await service.delete('rule-1');
      expect(prisma.markupRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });
  });

  describe('preview', () => {
    it('delegates to calculatePrice with correct params', async () => {
      prisma.markupRule.findMany.mockResolvedValue([mockDbRule()]);

      const result = await service.preview({
        basePrice: 500,
        productType: 'hotels',
        agentId: 'agent-1',
        routeFrom: 'JFK',
        routeTo: 'LHR',
      });

      expect(result.finalPrice).toBe(550);
    });
  });
});
