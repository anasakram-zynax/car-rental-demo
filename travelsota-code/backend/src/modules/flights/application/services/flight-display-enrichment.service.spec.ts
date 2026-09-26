import { FlightDisplayEnrichmentService } from './flight-display-enrichment.service';
import type { NormalizedFlightOffer } from '../../domain/entities/flight-search-response';

describe('FlightDisplayEnrichmentService', () => {
  let service: FlightDisplayEnrichmentService;
  let mockRepo: { findAirlinesByCodes: jest.Mock; findAirportsByCodes: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      findAirlinesByCodes: jest.fn(),
      findAirportsByCodes: jest.fn(),
    };
    service = new FlightDisplayEnrichmentService(mockRepo as any);
  });

  const makeOffer = (overrides?: Partial<NormalizedFlightOffer>): NormalizedFlightOffer => ({
    id: 'offer_1',
    provider: 'travelport',
    price: { currency: 'USD', base: 100, taxes: 20, total: 120 },
    stops: 0,
    segments: [],
    ...overrides,
  });

  describe('enrichOffers', () => {
    it('returns empty array for empty input', async () => {
      const result = await service.enrichOffers([]);
      expect(result).toEqual([]);
    });

    it('skips enrichment when all display fields are already populated', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'BA',
          airlineName: 'British Airways',
          airlineLogoUrl: 'https://logo.url',
          flightNumber: 'BA178',
          origin: { code: 'LHR', cityName: 'London', airportName: 'Heathrow', label: 'London (LHR)' },
          destination: { code: 'JFK', cityName: 'New York', airportName: 'JFK', label: 'New York (JFK)' },
          durationLabel: '7h',
          stopsLabel: 'Non-stop',
          supplier: 'travelport',
        },
      });

      const result = await service.enrichOffers([offer]);
      expect(mockRepo.findAirlinesByCodes).not.toHaveBeenCalled();
      expect(mockRepo.findAirportsByCodes).not.toHaveBeenCalled();
      expect(result[0].display!.airlineName).toBe('British Airways');
    });

    it('enriches missing airline name and logo from reference DB', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'BA',
          flightNumber: 'BA178',
          origin: { code: 'LHR', cityName: 'London', airportName: 'Heathrow', label: 'London (LHR)' },
          destination: { code: 'JFK', cityName: 'New York', airportName: 'JFK', label: 'New York (JFK)' },
          durationLabel: '7h',
          stopsLabel: 'Non-stop',
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([
        { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: 'https://logo.svg', logoLockupUrl: null },
      ]);
      mockRepo.findAirportsByCodes.mockResolvedValue([]);

      const result = await service.enrichOffers([offer]);
      expect(result[0].display!.airlineName).toBe('British Airways');
      expect(result[0].display!.airlineLogoUrl).toBe('https://logo.svg');
    });

    it('enriches missing airport city/airport name from reference DB', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'BA',
          airlineName: 'British Airways',
          flightNumber: 'BA178',
          origin: { code: 'LHR', label: 'LHR' },
          destination: { code: 'JFK', label: 'JFK' },
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([]);
      mockRepo.findAirportsByCodes.mockResolvedValue([
        { iataCode: 'LHR', name: 'Heathrow', cityName: 'London' },
        { iataCode: 'JFK', name: 'John F Kennedy', cityName: 'New York' },
      ]);

      const result = await service.enrichOffers([offer]);
      const d = result[0].display!;
      expect(d.origin.cityName).toBe('London');
      expect(d.origin.airportName).toBe('Heathrow');
      expect(d.origin.label).toBe('London (LHR)');
      expect(d.destination.cityName).toBe('New York');
      expect(d.destination.airportName).toBe('John F Kennedy');
      expect(d.destination.label).toBe('New York (JFK)');
    });

    it('enriches segment-level display fields including layover airports', async () => {
      const offer = makeOffer({
        segments: [
          {
            id: 'seg_1',
            carrier: 'BA',
            flightNumber: 'BA178',
            departure: { airport: 'LHR', date: '2026-08-15', time: '10:00' },
            arrival: { airport: 'DXB', date: '2026-08-15', time: '19:00' },
            display: {
              airlineCode: 'BA',
              flightNumber: 'BA178',
              origin: { code: 'LHR', label: 'LHR' },
              destination: { code: 'DXB', label: 'DXB' },
            },
          },
          {
            id: 'seg_2',
            carrier: 'EK',
            flightNumber: 'EK501',
            departure: { airport: 'DXB', date: '2026-08-15', time: '21:00' },
            arrival: { airport: 'JED', date: '2026-08-15', time: '23:00' },
            display: {
              airlineCode: 'EK',
              flightNumber: 'EK501',
              origin: { code: 'DXB', label: 'DXB' },
              destination: { code: 'JED', label: 'JED' },
            },
          },
        ],
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([
        { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: null, logoLockupUrl: null },
        { iataCode: 'EK', name: 'Emirates', logoSymbolUrl: 'https://ek.svg', logoLockupUrl: null },
      ]);
      mockRepo.findAirportsByCodes.mockResolvedValue([
        { iataCode: 'LHR', name: 'Heathrow', cityName: 'London' },
        { iataCode: 'DXB', name: 'Dubai International', cityName: 'Dubai' },
        { iataCode: 'JED', name: 'King Abdulaziz', cityName: 'Jeddah' },
      ]);

      const result = await service.enrichOffers([offer]);
      const seg0 = result[0].segments[0].display!;
      const seg1 = result[0].segments[1].display!;

      expect(seg0.airlineName).toBe('British Airways');
      expect(seg0.origin.cityName).toBe('London');
      expect(seg0.destination.cityName).toBe('Dubai');
      expect(seg0.destination.airportName).toBe('Dubai International');

      expect(seg1.airlineName).toBe('Emirates');
      expect(seg1.airlineLogoUrl).toBe('https://ek.svg');
      expect(seg1.origin.cityName).toBe('Dubai');
      expect(seg1.destination.cityName).toBe('Jeddah');
      expect(seg1.destination.airportName).toBe('King Abdulaziz');
    });

    it('uppercases codes before query', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'ba',
          flightNumber: 'BA178',
          origin: { code: 'lhr', label: 'lhr' },
          destination: { code: 'jfk', label: 'jfk' },
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([
        { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: null, logoLockupUrl: null },
      ]);
      mockRepo.findAirportsByCodes.mockResolvedValue([
        { iataCode: 'LHR', name: 'Heathrow', cityName: 'London' },
        { iataCode: 'JFK', name: 'John F Kennedy', cityName: 'New York' },
      ]);

      const result = await service.enrichOffers([offer]);
      expect(result[0].display!.airlineName).toBe('British Airways');
      expect(mockRepo.findAirlinesByCodes).toHaveBeenCalledWith(['BA']);
    });

    it('falls back to raw codes when DB lookup fails', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'BA',
          flightNumber: 'BA178',
          origin: { code: 'LHR', label: 'LHR' },
          destination: { code: 'JFK', label: 'JFK' },
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockRejectedValue(new Error('DB connection lost'));
      mockRepo.findAirportsByCodes.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.enrichOffers([offer]);
      expect(result[0].display!.airlineName).toBeUndefined();
      expect(result[0].display!.origin.cityName).toBeUndefined();
    });

    it('falls back to raw codes when DB lookup returns empty', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'XX',
          flightNumber: 'XX999',
          origin: { code: 'ZZZ', label: 'ZZZ' },
          destination: { code: 'YYY', label: 'YYY' },
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([]);
      mockRepo.findAirportsByCodes.mockResolvedValue([]);

      const result = await service.enrichOffers([offer]);
      expect(result[0].display!.airlineName).toBeUndefined();
      expect(result[0].display!.origin.cityName).toBeUndefined();
      expect(result[0].display!.origin.label).toBe('ZZZ');
    });

    it('uses fallback logoLockupUrl when logoSymbolUrl is null', async () => {
      const offer = makeOffer({
        display: {
          airlineCode: 'BA',
          flightNumber: 'BA178',
          origin: { code: 'LHR', label: 'LHR' },
          destination: { code: 'JFK', label: 'JFK' },
          supplier: 'travelport',
        },
      });

      mockRepo.findAirlinesByCodes.mockResolvedValue([
        { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: null, logoLockupUrl: 'https://lockup.svg' },
      ]);
      mockRepo.findAirportsByCodes.mockResolvedValue([]);

      const result = await service.enrichOffers([offer]);
      expect(result[0].display!.airlineLogoUrl).toBe('https://lockup.svg');
    });

    it('deduplicates codes before query', async () => {
      const offers = [
        makeOffer({
          id: 'offer_1',
          display: {
            airlineCode: 'BA',
            origin: { code: 'LHR', label: 'LHR' },
            destination: { code: 'JFK', label: 'JFK' },
            supplier: 'travelport',
          },
        }),
        makeOffer({
          id: 'offer_2',
          display: {
            airlineCode: 'BA',
            origin: { code: 'LHR', label: 'LHR' },
            destination: { code: 'DXB', label: 'DXB' },
            supplier: 'travelport',
          },
        }),
      ];

      mockRepo.findAirlinesByCodes.mockResolvedValue([
        { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: null, logoLockupUrl: null },
      ]);
      mockRepo.findAirportsByCodes.mockResolvedValue([
        { iataCode: 'LHR', name: 'Heathrow', cityName: 'London' },
        { iataCode: 'JFK', name: 'John F Kennedy', cityName: 'New York' },
        { iataCode: 'DXB', name: 'Dubai International', cityName: 'Dubai' },
      ]);

      const result = await service.enrichOffers(offers);
      const codesArg = mockRepo.findAirlinesByCodes.mock.calls[0][0] as string[];
      expect(codesArg).toEqual(['BA']);
    });
  });
});
