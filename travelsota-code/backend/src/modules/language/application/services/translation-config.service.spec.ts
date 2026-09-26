import { Test } from '@nestjs/testing';
import { TranslationConfigService } from './translation-config.service';
import { PrismaService } from '../../../../shared/database/prisma.service';

describe('TranslationConfigService', () => {
  async function makeService(storedConfig: Record<string, unknown> | null) {
    let current = storedConfig;
    const prisma = {
      providerConfig: {
        findUnique: jest.fn(async () =>
          current ? { encryptedConfig: JSON.stringify(current) } : null,
        ),
        upsert: jest.fn(async ({ create }: { create: { encryptedConfig: string } }) => {
          current = JSON.parse(create.encryptedConfig) as Record<string, unknown>;
          return {};
        }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [TranslationConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return { service: moduleRef.get(TranslationConfigService), prisma };
  }

  it('reports defaults when nothing stored', async () => {
    const { service } = await makeService(null);
    const view = await service.getConfig(new Date('2026-01-15T00:00:00Z'));
    expect(view.provider).toBe('gtx');
    expect(view.keyRequired).toBe(false);
    expect(view.periodKey).toBe('2026-01');
    expect(view.charsUsedThisPeriod).toBe(0);
    expect(view.remainingChars).toBe(view.monthlyCharLimit);
  });

  it('reports usage for current period, resets on period change', async () => {
    const { service } = await makeService({
      charsUsed: 1000,
      periodKey: '2026-01',
      monthlyCharLimit: 500000,
    });
    const current = await service.getConfig(new Date('2026-01-20T00:00:00Z'));
    expect(current.charsUsedThisPeriod).toBe(1000);
    expect(current.remainingChars).toBe(499000);
    const next = await service.getConfig(new Date('2026-02-01T00:00:00Z'));
    expect(next.charsUsedThisPeriod).toBe(0);
  });

  it('saves monthly limit via upsert', async () => {
    const { service, prisma } = await makeService(null);
    const view = await service.saveConfig({ monthlyCharLimit: 100000 });
    expect(prisma.providerConfig.upsert).toHaveBeenCalledTimes(1);
    expect(view.monthlyCharLimit).toBe(100000);
  });
});
