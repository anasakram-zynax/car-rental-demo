import { Test } from '@nestjs/testing';
import { TravelportErrorClassifierService } from './travelport-error-classifier.service';

describe('TravelportErrorClassifierService', () => {
  let service: TravelportErrorClassifierService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [TravelportErrorClassifierService],
    }).compile();
    service = module.get(TravelportErrorClassifierService);
  });

  // ── classifySearch ──

  describe('classifySearch', () => {
    it('returns ok when no errors', () => {
      const result = service.classifySearch([{ id: 'offer-1' }], undefined);
      expect(result.severity).toBe('ok');
    });

    it('returns warning when offers exist with errors', () => {
      const offers = [{ id: 'offer-1' }];
      const errors = [{ SourceCode: 'NDC', Message: '3346 ITIN IS MISSING' }];
      const result = service.classifySearch(offers, errors);
      expect(result.severity).toBe('warning');
      expect(result.errors).toHaveLength(1);
      expect(result.message).toContain('warning');
    });

    it('returns fatal when no offers with errors', () => {
      const errors = [{ SourceCode: 'TRAVELPORT_BE', Message: 'Search failed' }];
      const result = service.classifySearch([], errors);
      expect(result.severity).toBe('fatal');
      expect(result.message).toContain('no offers returned');
    });

    it('returns ok with empty offers and no errors', () => {
      const result = service.classifySearch([], undefined);
      expect(result.severity).toBe('ok');
    });

    it('returns ok with empty errors array and no offers (empty array = no errors)', () => {
      const result = service.classifySearch([], []);
      expect(result.severity).toBe('ok');
    });

    it('returns warning with multiple offers and multiple errors', () => {
      const offers = [{ id: 'offer-1' }, { id: 'offer-2' }, { id: 'offer-3' }];
      const errors = [
        { SourceCode: 'NDC', Message: 'Warning 1' },
        { SourceCode: 'NDC', Message: 'Warning 2' },
      ];
      const result = service.classifySearch(offers, errors);
      expect(result.severity).toBe('warning');
      expect(result.errors).toHaveLength(2);
    });
  });

  // ── classifyPrice ──

  describe('classifyPrice', () => {
    it('returns ok when no errors', () => {
      expect(service.classifyPrice(undefined).severity).toBe('ok');
      expect(service.classifyPrice([]).severity).toBe('ok');
    });

    it('returns fatal when errors present', () => {
      const result = service.classifyPrice([{ Message: 'Pricing error' }]);
      expect(result.severity).toBe('fatal');
      expect(result.message).toBe('Pricing failed.');
    });

    it('attaches errors to classification', () => {
      const errors = [{ code: 'ERR1' }];
      const result = service.classifyPrice(errors);
      expect(result.errors).toEqual(errors);
    });
  });

  // ── classifyAddOffer ──

  describe('classifyAddOffer', () => {
    it('returns ok when no errors', () => {
      expect(service.classifyAddOffer(undefined).severity).toBe('ok');
    });

    it('returns fatal when errors present', () => {
      const result = service.classifyAddOffer([{ Message: 'Add-offer error' }]);
      expect(result.severity).toBe('fatal');
      expect(result.message).toBe('Add-offer failed.');
    });
  });

  // ── classifyCommit ──

  describe('classifyCommit', () => {
    it('returns ok when no errors', () => {
      expect(service.classifyCommit(undefined).severity).toBe('ok');
    });

    it('returns fatal when errors present', () => {
      const result = service.classifyCommit([{ Message: 'Commit error' }]);
      expect(result.severity).toBe('fatal');
      expect(result.message).toBe('Commit failed.');
    });
  });

  // ── classifySeatMap ──

  describe('classifySeatMap', () => {
    it('returns ok when no errors', () => {
      expect(service.classifySeatMap(undefined).severity).toBe('ok');
    });

    it('returns unavailable when errors present', () => {
      const result = service.classifySeatMap([{ Message: 'No seats' }]);
      expect(result.severity).toBe('unavailable');
      expect(result.message).toBe('Seat map unavailable from supplier.');
      expect(result.reason).toBe('SUPPLIER_ERROR');
    });

    it('attaches errors to classification', () => {
      const errors = [{ code: 'NO_SEATS' }];
      const result = service.classifySeatMap(errors);
      expect(result.errors).toEqual(errors);
    });
  });

  // ── classifyAncillaryShop ──

  describe('classifyAncillaryShop', () => {
    it('returns ok when no errors', () => {
      expect(service.classifyAncillaryShop(undefined).severity).toBe('ok');
    });

    it('returns unavailable when errors present', () => {
      const result = service.classifyAncillaryShop([{ Message: 'Ancillary unavailable' }]);
      expect(result.severity).toBe('unavailable');
      expect(result.message).toBe('Extra services unavailable for this booking.');
      expect(result.reason).toBe('SUPPLIER_ERROR');
    });

    it('attaches errors to classification', () => {
      const errors = [{ code: 'NO_ANCILLARIES' }];
      const result = service.classifyAncillaryShop(errors);
      expect(result.errors).toEqual(errors);
    });

    it('returns ok with empty errors array (empty array = no errors)', () => {
      const result = service.classifyAncillaryShop([]);
      expect(result.severity).toBe('ok');
    });
  });

  // ── classifyFatal ──

  describe('classifyFatal', () => {
    it('returns ok when no errors', () => {
      expect(service.classifyFatal(undefined).severity).toBe('ok');
      expect(service.classifyFatal([]).severity).toBe('ok');
    });

    it('returns fatal when errors present', () => {
      const result = service.classifyFatal([{ Message: 'Generic error' }]);
      expect(result.severity).toBe('fatal');
      expect(result.message).toBe('Supplier request failed.');
    });

    it('attaches errors to classification', () => {
      const errors = [{ code: 'ERR' }];
      const result = service.classifyFatal(errors);
      expect(result.errors).toEqual(errors);
    });
  });
});
