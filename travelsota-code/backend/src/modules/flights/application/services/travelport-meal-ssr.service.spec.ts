import { Test } from '@nestjs/testing';
import { TravelportMealSsrService } from './travelport-meal-ssr.service';
import { TravelportBookingCoreService } from './travelport-booking-core.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';

describe('TravelportMealSsrService', () => {
  let service: TravelportMealSsrService;
  let coreService: jest.Mocked<TravelportBookingCoreService>;

  const mockConfigService = {
    travelport: {
      baseUrl: 'https://api.travelport.com',
      acceptVersion: 'v42.0',
      contentVersion: 'v42.0',
      authUrl: 'https://auth.travelport.com/token',
      oauthGrantType: 'password',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      username: 'test-user',
      password: 'test-pass',
      requestTimeoutMs: 30000,
    },
  };

  const mockHttpClient = { request: jest.fn() };
  const mockCacheService = { get: jest.fn(), set: jest.fn() };
  const mockProviderConfigService = {
    getFlightsProviderRuntime: jest.fn().mockResolvedValue({ config: {} }),
  };

  beforeAll(async () => {
    mockCacheService.get.mockResolvedValue({
      access_token: 'test-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    const module = await Test.createTestingModule({
      providers: [
        TravelportMealSsrService,
        TravelportBookingCoreService,
        { provide: AppConfigService, useValue: mockConfigService },
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ProviderConfigService, useValue: mockProviderConfigService },
      ],
    }).compile();

    service = module.get(TravelportMealSsrService);
    coreService = module.get(TravelportBookingCoreService) as jest.Mocked<TravelportBookingCoreService>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── buildMealOptions ──

  describe('buildMealOptions', () => {
    it('returns all standard SSR meal codes', () => {
      const options = service.buildMealOptions();
      const codes = options.map((o) => o.supplier?.ssrCode);
      expect(codes).toEqual(expect.arrayContaining(['VGML', 'AVML', 'HNML', 'KSML', 'MOML', 'CHML', 'BBML']));
    });

    it('each option has price 0', () => {
      const options = service.buildMealOptions();
      for (const opt of options) {
        expect(opt.price.amount).toBe(0);
      }
    });

    it('each option has requiresSupplierConfirmation true', () => {
      const options = service.buildMealOptions();
      for (const opt of options) {
        expect(opt.requiresSupplierConfirmation).toBe(true);
      }
    });

    it('each option has source specialservices', () => {
      const options = service.buildMealOptions();
      for (const opt of options) {
        expect(opt.source).toBe('specialservices');
      }
    });

    it('each option has quantityMax 1 and quantityMin 0', () => {
      const options = service.buildMealOptions();
      for (const opt of options) {
        expect(opt.quantityMax).toBe(1);
        expect(opt.quantityMin).toBe(0);
      }
    });

    it('each option has type meal', () => {
      const options = service.buildMealOptions();
      for (const opt of options) {
        expect(opt.type).toBe('meal');
      }
    });
  });

  // ── addMealsToWorkbench ──

  describe('addMealsToWorkbench', () => {
    const mockRequestAir = jest.fn();
    const workbenchId = 'wb-test-123';

    beforeEach(() => {
      // Spy on requestAir via coreService
      jest.spyOn(coreService, 'requestAir').mockImplementation(mockRequestAir);
    });

    it('returns true when no selections provided', async () => {
      const result = await service.addMealsToWorkbench(workbenchId, 'sess-1', []);
      expect(result).toBe(true);
      expect(mockRequestAir).not.toHaveBeenCalled();
    });

    it('makes one POST per traveler selection', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });
      const selections = [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'Vegan Meal' },
        { travelerIndex: 1, travelerRef: 'trav_2', mealCode: 'AVML', mealName: 'Asian Vegetarian' },
      ];

      const result = await service.addMealsToWorkbench(workbenchId, 'sess-1', selections);

      expect(result).toBe(true);
      expect(mockRequestAir).toHaveBeenCalledTimes(2);
    });

    it('sends SSR body with @type SpecialServiceRequest', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'Vegan Meal' },
      ]);

      const callArg = mockRequestAir.mock.calls[0];
      expect(callArg[0]).toBe('POST');
      expect(callArg[1]).toContain('specialservicerequests');
      expect(callArg[2].body['@type']).toBe('SpecialServiceRequest');
      expect(callArg[2].body.SSRCode).toBe('VGML');
    });

    it('sets SpecialServiceRef to traveler ref', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'MOML', mealName: 'Muslim Meal' },
      ]);

      const body = mockRequestAir.mock.calls[0][2].body;
      expect(body.SpecialServiceRef).toBe('trav_1');
    });

    it('generates unique SSR entry IDs per traveler', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'V' },
        { travelerIndex: 1, travelerRef: 'trav_2', mealCode: 'CHML', mealName: 'C' },
      ]);

      const id1 = mockRequestAir.mock.calls[0][2].body.id;
      const id2 = mockRequestAir.mock.calls[1][2].body.id;
      expect(id1).not.toBe(id2);
      expect(id1).toBe('ssr_meal_trav_1');
      expect(id2).toBe('ssr_meal_trav_2');
    });

    it('includes sessionId in request options when provided', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, 'test-session-id', [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'Vegan' },
      ]);

      const options = mockRequestAir.mock.calls[0][2];
      expect(options.sessionId).toBe('test-session-id');
    });

    it('uses SSRDescription from mealName, falls back to mealCode', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'Vegan Meal' },
      ]);

      const body = mockRequestAir.mock.calls[0][2].body;
      expect(body.SSRDescription).toBe('Vegan Meal');
    });

    it('returns false when requestAir throws (non-fatal)', async () => {
      mockRequestAir.mockRejectedValue(new Error('Network error'));

      const result = await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'V' },
      ]);

      expect(result).toBe(false);
    });

    it('returns false on partial failure (first SSR succeeds, second fails)', async () => {
      mockRequestAir
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('SSR failed'));

      const result = await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'V' },
        { travelerIndex: 1, travelerRef: 'trav_2', mealCode: 'AVML', mealName: 'A' },
      ]);

      expect(result).toBe(false);
      expect(mockRequestAir).toHaveBeenCalledTimes(2);
    });

    it('sets softFail true in request options', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench(workbenchId, undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'V' },
      ]);

      const options = mockRequestAir.mock.calls[0][2];
      expect(options.softFail).toBe(true);
    });

    it('encodes workbenchId in URL path', async () => {
      mockRequestAir.mockResolvedValue({ ok: true });

      await service.addMealsToWorkbench('wb/test+id', undefined, [
        { travelerIndex: 0, travelerRef: 'trav_1', mealCode: 'VGML', mealName: 'V' },
      ]);

      const url = mockRequestAir.mock.calls[0][1];
      expect(url).toContain(encodeURIComponent('wb/test+id'));
    });
  });
});
