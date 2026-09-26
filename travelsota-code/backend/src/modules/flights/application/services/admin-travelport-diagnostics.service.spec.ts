import { Test } from '@nestjs/testing';
import { AdminTravelportDiagnosticsService } from './admin-travelport-diagnostics.service';
import { TravelportBookingCoreService } from './travelport-booking-core.service';
import { FlightBookingExtraRepoPortToken } from '../ports/flight-booking-extra-repo.port';

describe('AdminTravelportDiagnosticsService', () => {
  let service: AdminTravelportDiagnosticsService;
  let extraRepo: { findByBookingId: jest.Mock; findById: jest.Mock; update: jest.Mock };

  beforeAll(async () => {
    extraRepo = {
      findByBookingId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AdminTravelportDiagnosticsService,
        {
          provide: TravelportBookingCoreService,
          useValue: {
            resolveConfig: jest.fn().mockResolvedValue({
              baseUrl: 'https://api.travelport.com',
              clientId: 'test-client',
              pcc: 'TEST',
              accessGroup: 'test-group',
              acceptVersion: '11',
              contentVersion: '11',
            }),
            getAccessToken: jest.fn().mockResolvedValue({
              access_token: 'mock-token',
              expires_in: 3600,
            }),
            createWorkbench: jest.fn().mockResolvedValue({
              workbenchId: 'wb-mock-123',
              sessionId: 'sess-mock-456',
            }),
          },
        },
        {
          provide: FlightBookingExtraRepoPortToken,
          useValue: extraRepo,
        },
      ],
    }).compile();

    service = module.get(AdminTravelportDiagnosticsService);
  });

  describe('runDiagnostics', () => {
    it('runs all diagnostic steps successfully', async () => {
      const result = await service.runDiagnostics();
      expect(result.ok).toBe(true);
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      expect(result.steps.every((s) => s.ok)).toBe(true);
      expect(result.configSanitized).toBeDefined();
      expect(result.configSanitized.hasConfig).toBe(true);
      expect(result.configSanitized.baseUrl).toContain('api.travelport.com');
    });
  });

  describe('getAdminExtras', () => {
    it('returns extras for a booking', async () => {
      extraRepo.findByBookingId.mockResolvedValue([
        {
          id: 'extra-1',
          type: 'seat',
          status: 'confirmed',
          label: 'Seat 12A',
          amount: 25,
          currency: 'USD',
          supplierErrorCode: null,
          supplierErrorMessage: null,
          createdAt: '2026-06-27T00:00:00Z',
          updatedAt: '2026-06-27T00:00:00Z',
        },
      ]);

      const result = await service.getAdminExtras('booking-1');
      expect(result.ok).toBe(true);
      expect(result.totalExtras).toBe(1);
      expect(result.extras[0].type).toBe('seat');
    });

    it('returns error object on failure', async () => {
      extraRepo.findByBookingId.mockRejectedValue(new Error('DB error'));
      const result = await service.getAdminExtras('booking-2');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('DB error');
    });
  });

  describe('retryFailedExtras', () => {
    it('resets failed extras to selected', async () => {
      extraRepo.findById.mockResolvedValue({
        id: 'extra-1',
        status: 'failed',
        type: 'seat',
        amount: 25,
        currency: 'USD',
      });
      extraRepo.update.mockResolvedValue(null);

      const result = await service.retryFailedExtras('booking-1', ['extra-1']);
      expect(result.ok).toBe(true);
      expect(result.results[0].ok).toBe(true);
      expect(extraRepo.update).toHaveBeenCalledWith('extra-1', { status: 'selected' });
    });

    it('skips extras that are not failed', async () => {
      extraRepo.findById.mockResolvedValue({
        id: 'extra-2',
        status: 'confirmed',
        type: 'baggage',
        amount: 50,
        currency: 'USD',
      });

      const result = await service.retryFailedExtras('booking-1', ['extra-2']);
      expect(result.results[0].ok).toBe(false);
      expect(result.results[0].error).toContain('Cannot retry');
    });

    it('handles missing extras', async () => {
      extraRepo.findById.mockResolvedValue(null);
      const result = await service.retryFailedExtras('booking-1', ['missing-1']);
      expect(result.results[0].ok).toBe(false);
      expect(result.results[0].error).toContain('not found');
    });
  });

  describe('refundFailedExtras', () => {
    it('marks extras as refunded with reason', async () => {
      extraRepo.findById.mockResolvedValue({
        id: 'extra-1',
        status: 'failed',
        type: 'baggage',
        amount: 50,
        currency: 'USD',
      });
      extraRepo.update.mockResolvedValue(null);

      const result = await service.refundFailedExtras('booking-1', ['extra-1'], 'Customer requested');
      expect(result.ok).toBe(true);
      expect(result.results[0].ok).toBe(true);
      expect(extraRepo.update).toHaveBeenCalledWith('extra-1', {
        status: 'refunded',
        supplierErrorCode: 'ADMIN_REFUND',
        supplierErrorMessage: 'Customer requested',
      });
    });
  });
});
