import { Test } from '@nestjs/testing';
import { TranslationGeneratorService } from './translation-generator.service';
import { PrismaService } from '../../../../shared/database/prisma.service';

function makePrismaMock(storedConfig: Record<string, unknown> | null) {
  return {
    providerConfig: {
      findUnique: jest.fn(async () =>
        storedConfig ? { encryptedConfig: JSON.stringify(storedConfig) } : null,
      ),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
  };
}

// gtx shape: [[[translated, source, ...]]]
function gtxOk(translated: string) {
  return { ok: true, json: async () => [[[translated, 'src', null, null, 10]]] } as unknown as Response;
}

describe('TranslationGeneratorService (gtx)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  async function makeService(storedConfig: Record<string, unknown> | null = {}) {
    const prisma = makePrismaMock(storedConfig);
    const moduleRef = await Test.createTestingModule({
      providers: [TranslationGeneratorService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return { service: moduleRef.get(TranslationGeneratorService), prisma };
  }

  it('throws on empty sourceContent', async () => {
    const { service } = await makeService();
    await expect(service.generateTranslations('ar', 'Arabic', { sourceContent: {} })).rejects.toThrow(
      'sourceContent is required',
    );
  });

  it('shields placeholders through translation and restores them', async () => {
    const { service } = await makeService();
    jest.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const q = decodeURIComponent(String(url).split('&q=')[1] ?? '');
      // echo back with Arabic prefix, tokens intact
      return gtxOk(`مرحبا ${q.replace('Hello ', '')}`);
    });
    const res = await service.generateTranslations('ar', 'Arabic', {
      sourceContent: { Common: { hello: 'Hello {name}' } },
    });
    expect(res.keys).toBe(1);
    expect(res.content).toEqual({ Common: { hello: 'مرحبا {name}' } });
    expect(res.warnings).toEqual([]);
    expect(res.charsUsed).toBe('Hello {name}'.length);
    // placeholder sent shielded, not raw
    const sentUrl = String(jest.mocked(global.fetch).mock.calls[0][0]);
    expect(sentUrl).toContain('__P0__');
    expect(sentUrl).not.toContain(encodeURIComponent('{name}'));
  });

  it('falls back to English on failure, lost token, tag mismatch, dropped brand', async () => {
    const { service } = await makeService();
    jest.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const q = String(url);
      if (q.includes(encodeURIComponent('fail me'))) return { ok: false } as unknown as Response;
      if (q.includes('__P0__')) return gtxOk('Bonjour'); // token dropped
      if (q.includes(encodeURIComponent('bold <strong>text</strong>')))
        return gtxOk('عريض نص'); // tags dropped
      return gtxOk('Pay now'); // brand dropped
    });
    const res = await service.generateTranslations('ar', 'Arabic', {
      sourceContent: {
        Common: { a: 'fail me', b: 'Hello {name}', c: 'bold <strong>text</strong>', d: 'TravelsOTA rules' },
      },
    });
    expect(res.content).toEqual({
      Common: { a: 'fail me', b: 'Hello {name}', c: 'bold <strong>text</strong>', d: 'TravelsOTA rules' },
    });
    expect(res.warnings).toHaveLength(4);
  });

  it('testConnection probes Hello -> ar', async () => {
    const { service } = await makeService();
    jest.spyOn(global, 'fetch').mockImplementation(async () => gtxOk('مرحبا'));
    const res = await service.testConnection();
    expect(res.ok).toBe(true);
    expect(res.translated).toBe('مرحبا');
    expect(res.chars).toBe(5);
  });

  it('testConnection throws when endpoint fails', async () => {
    const { service } = await makeService();
    jest.spyOn(global, 'fetch').mockImplementation(async () => ({ ok: false }) as unknown as Response);
    await expect(service.testConnection()).rejects.toThrow('unreachable or throttled');
  });
});
