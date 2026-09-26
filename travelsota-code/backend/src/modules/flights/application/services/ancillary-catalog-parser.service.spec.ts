import { Test } from '@nestjs/testing';
import { AncillaryCatalogParserService } from './ancillary-catalog-parser.service';

describe('AncillaryCatalogParserService', () => {
  let service: AncillaryCatalogParserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AncillaryCatalogParserService],
    }).compile();
    service = module.get<AncillaryCatalogParserService>(AncillaryCatalogParserService);
  });

  // ── Helpers ──

  /** Build a minimal seat availability product */
  function seatProduct(id: string, seatNumber: string, status = 'Available') {
    return {
      '@type': 'ProductSeatAvailability',
      id,
      SeatAvailability: [{ seatAvailabilityStatus: status, value: [seatNumber] }],
      SeatingChartRef: 'seatingChart_1',
    };
  }

  /** Build a minimal ancillary shop product with a given type, name, price */
  function shopProduct(
    id: string,
    type: string,
    name: string,
    priceTotal?: number,
    extra?: Record<string, unknown>,
  ) {
    const product: Record<string, unknown> = {
      '@type': type,
      id,
      name,
      ...extra,
    };
    if (priceTotal !== undefined) {
      product.Price = { TotalPrice: priceTotal, CurrencyCode: { value: 'USD' } };
    }
    return product;
  }

  /** Build a minimal CatalogOfferingsAncillaryListResponse wrapper */
  function wrapResponse(products: Record<string, unknown>[]): Record<string, unknown> {
    return {
      CatalogOfferingsAncillaryListResponse: {
        Identifier: { value: 'resp-id-1' },
        CatalogOfferingsID: [
          {
            Identifier: { value: 'co-id-1' },
            CatalogOffering: [
              {
                id: 'co-offer-id-1',
                Identifier: { value: 'co-offer-id-1' },
                Price: { TotalPrice: 100, CurrencyCode: { value: 'USD' } },
                ProductOptions: [
                  {
                    Product: products,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  /** Build a multi-offering response (simulating multiple catalog offerings) */
  function wrapMultiResponse(
    offeringGroups: Record<string, unknown>[][],
  ): Record<string, unknown> {
    return {
      CatalogOfferingsAncillaryListResponse: {
        Identifier: { value: 'resp-id-multi' },
        CatalogOfferingsID: offeringGroups.map((products, idx) => ({
          Identifier: { value: `co-id-${idx}` },
          CatalogOffering: [
            {
              id: `co-offer-${idx}`,
              Identifier: { value: `co-offer-${idx}` },
              Price: { TotalPrice: 50, CurrencyCode: { value: 'USD' } },
              ProductOptions: [{ Product: products }],
            },
          ],
        })),
      },
    };
  }

  // ── Seat Availability Tests ──

  describe('Seat availability parsing', () => {
    it('extracts seats when includeSeats=true', () => {
      const response = wrapResponse([
        seatProduct('s1', '10A', 'Available'),
        seatProduct('s2', '10B', 'Available'),
        seatProduct('s3', '10C', 'Occupied'),
      ]);

      const options = service.parseAncillaryShopResponse(response, 'seatavailability', true);

      expect(options).toHaveLength(3);
      for (const opt of options) {
        expect(opt.type).toBe('seat');
        expect(opt.source).toBe('seatavailability');
      }
      expect(options[0].supplier.productIdentifier).toBe('s1');
    });

    it('skips seat products when includeSeats=false (default)', () => {
      const response = wrapResponse([
        seatProduct('s1', '10A', 'Available'),
        shopProduct('bg1', 'Baggage', 'Extra Bag 23kg', 50),
      ]);

      // Default includeSeats=false
      const options = service.parseAncillaryShopResponse(response, 'ancillaryshop');

      expect(options).toHaveLength(1);
      expect(options[0].type).toBe('baggage');
      expect(options[0].id).toContain('bg1');
    });

    it('does not classify seat brands as separate services', () => {
      const response = wrapResponse([
        {
          '@type': 'ProductSeatAvailability',
          id: 's1',
          SeatAvailability: [{ seatAvailabilityStatus: 'Available', value: ['10A'] }],
          Brand: { name: 'Preferred Seats' },
          SeatingChartRef: 'seatingChart_1',
        },
      ]);

      const options = service.parseAncillaryShopResponse(response, 'seatavailability', true);

      expect(options).toHaveLength(1);
      expect(options[0].type).toBe('seat');
      expect(options[0].label).toBe('Preferred Seats — 10A');
    });
  });

  // ── Baggage Parsing Tests ──

  describe('Baggage parsing', () => {
    it('extracts baggage from baggage-like products', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Extra Checked Bag 23kg', 50),
        shopProduct('bg2', 'Baggage', 'Carry On Bag', 0),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(2);
      for (const opt of options) {
        expect(opt.type).toBe('baggage');
      }
    });

    it('extracts checked baggage from different naming patterns', () => {
      const names = ['Checked Bag 30kg', 'Excess Baggage 10kg', 'Luggage Allowance', 'Suitcase Extra'];
      const products = names.map((name, i) => shopProduct(`bg${i}`, 'Baggage', name, 30 + i * 10));

      const options = service.parseAncillaryShopResponse(wrapResponse(products));
      expect(options).toHaveLength(names.length);
      expect(options.every((o) => o.type === 'baggage')).toBe(true);
    });

    it('extracts price and currency from baggage products', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Heavy Bag 32kg', 75),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(1);
      expect(options[0].price.amount).toBe(75);
      expect(options[0].price.currency).toBe('USD');
    });
  });

  // ── Services Parsing Tests ──

  describe('Services parsing', () => {
    it('extracts sports equipment', () => {
      const response = wrapResponse([
        shopProduct('sp1', 'Service', 'Golf Equipment', 100),
        shopProduct('sp2', 'Service', 'Ski Bag', 80),
        shopProduct('sp3', 'Service', 'Bicycle', 60),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(3);
      for (const opt of options) {
        expect(opt.type).toBe('sports_equipment');
      }
    });

    it('extracts priority/boarding services', () => {
      const response = wrapResponse([
        shopProduct('pr1', 'Service', 'Priority Boarding', 25),
        shopProduct('pr2', 'Service', 'Fast Track Security', 30),
        shopProduct('pr3', 'Service', 'Preferential Seating', 20),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(3);
      for (const opt of options) {
        expect(opt.type).toBe('priority');
      }
    });

    it('extracts lounge access', () => {
      const response = wrapResponse([
        shopProduct('ln1', 'Service', 'Airport Lounge Access', 50),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(1);
      expect(options[0].type).toBe('lounge');
    });

    it('extracts Wi-Fi services', () => {
      const response = wrapResponse([
        shopProduct('wf1', 'Service', 'In-flight Wi-Fi', 15),
        shopProduct('wf2', 'Service', 'Internet Connectivity', 10),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(2);
      for (const opt of options) {
        expect(opt.type).toBe('wifi');
      }
    });

    it('extracts pet services', () => {
      const response = wrapResponse([
        shopProduct('pt1', 'Service', 'Pet in Cabin', 150),
        shopProduct('pt2', 'Service', 'Animal Cargo', 200),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(2);
      for (const opt of options) {
        expect(opt.type).toBe('pet');
      }
    });

    it('extracts meal services from ancillary shop', () => {
      const response = wrapResponse([
        shopProduct('ml1', 'Service', 'Premium Meal', 25),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(1);
      expect(options[0].type).toBe('meal');
    });
  });

  // ── Unknown / Other Classification Tests ──

  describe('Unknown product classification', () => {
    it('classifies unknown paid products as "other"', () => {
      const response = wrapResponse([
        shopProduct('unk1', 'Miscellaneous', 'Travel Insurance', 35),
        shopProduct('unk2', 'Service', 'Seat Cushion', 12),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(2);
      for (const opt of options) {
        expect(opt.type).toBe('other');
      }
      expect(options[0].supplier.productIdentifier).toBe('unk1');
      expect(options[1].supplier.productIdentifier).toBe('unk2');
    });

    it('includes supplier identifiers for "other" products', () => {
      const response = wrapResponse([
        shopProduct('unk1', 'Service', 'Extra Service', 50),
      ]);

      const options = service.parseAncillaryShopResponse(response);

      expect(options).toHaveLength(1);
      const s = options[0].supplier;
      expect(s.productIdentifier).toBe('unk1');
      expect(s.catalogOfferingIdentifier).toBe('co-offer-id-1');
      expect(s.catalogOfferingsIdentifier).toBe('resp-id-1');
      expect(s.catalogOfferingsIdIdentifier).toBe('co-id-1');
    });
  });

  // ── Price Extraction Tests ──

  describe('Price extraction', () => {
    it('extracts price from TotalPrice', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Checked Bag', 75),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].price.amount).toBe(75);
    });

    it('extracts price from Base when TotalPrice is absent', () => {
      const response = wrapResponse([
        {
          '@type': 'Baggage',
          id: 'bg1',
          name: 'Extra Bag',
          Price: { Base: 60, CurrencyCode: { value: 'EUR' } },
        },
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].price.amount).toBe(60);
      expect(options[0].price.currency).toBe('EUR');
    });

    it('extracts price from PriceBreakdown.Amount.Total', () => {
      const response = wrapResponse([
        {
          '@type': 'Baggage',
          id: 'bg1',
          name: 'Extra Bag',
          Price: {
            PriceBreakdown: [
              { Amount: { Total: 90, CurrencyCode: { value: 'GBP' } } },
            ],
          },
        },
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].price.amount).toBe(90);
      expect(options[0].price.currency).toBe('GBP');
    });

    it('uses offering-level price when product-level price is absent', () => {
      const response = wrapResponse([
        {
          '@type': 'Baggage',
          id: 'bg1',
          name: 'Extra Bag',
          // No product-level Price — should fall back to offering's TotalPrice=100
        },
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].price.amount).toBe(100);
      expect(options[0].price.currency).toBe('USD');
    });

    it('handles zero price products', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Free Bag', 0),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].price.amount).toBe(0);
    });
  });

  // ── Identifier and Supplier Data Tests ──

  describe('Supplier identifiers', () => {
    it('extracts catalog-level and offering-level identifiers', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Extra Bag', 50),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      const s = options[0].supplier;
      expect(s.catalogOfferingsIdentifier).toBe('resp-id-1');
      expect(s.catalogOfferingsIdIdentifier).toBe('co-id-1');
      expect(s.catalogOfferingIdentifier).toBe('co-offer-id-1');
      expect(s.productIdentifier).toBe('bg1');
    });

    it('extracts traveler identifier when present', () => {
      const product = {
        '@type': 'Baggage',
        id: 'bg1',
        name: 'Extra Bag',
        TravelerIdentifier: { id: 'trav_1' },
        Price: { TotalPrice: 50, CurrencyCode: { value: 'USD' } },
      };
      const response = wrapResponse([product]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].travelerRef).toBe('trav_1');
      expect(options[0].supplier.travelerIdentifierRef).toBe('trav_1');
    });
  });

  // ── Multi-Offering Response Tests ──

  describe('Multi-offering responses', () => {
    it('processes products across multiple catalog offerings', () => {
      const response = wrapMultiResponse([
        [shopProduct('bg1', 'Baggage', 'Outbound Bag', 50)],
        [shopProduct('bg2', 'Baggage', 'Return Bag', 50)],
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options).toHaveLength(2);
      expect(options[0].supplier.catalogOfferingIdentifier).toBe('co-offer-0');
      expect(options[1].supplier.catalogOfferingIdentifier).toBe('co-offer-1');
    });
  });

  // ── Included / Quantity Tests ──

  describe('Included indicator and quantity', () => {
    it('marks option as includedInOfferPrice when total is 0', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Included Bag', 0),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].includedInOfferPrice).toBe(true);
    });

    it('marks option as not included when price > 0', () => {
      const response = wrapResponse([
        shopProduct('bg1', 'Baggage', 'Paid Bag', 50),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].includedInOfferPrice).toBeFalsy();
    });

    it('extracts quantity min/max when present', () => {
      const response = wrapResponse([
        {
          '@type': 'Baggage',
          id: 'bg1',
          name: 'Extra Bag',
          maxQuantity: 3,
          minQuantity: 1,
          Price: { TotalPrice: 50, CurrencyCode: { value: 'USD' } },
        },
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options[0].quantityMin).toBe(1);
      expect(options[0].quantityMax).toBe(3);
    });
  });

  // ── Edge Cases ──

  describe('Edge cases', () => {
    it('returns empty array for null/undefined input', () => {
      expect(service.parseAncillaryShopResponse(null as unknown as Record<string, unknown>)).toEqual([]);
      expect(service.parseAncillaryShopResponse(undefined as unknown as Record<string, unknown>)).toEqual([]);
    });

    it('returns empty array for empty response', () => {
      const empty: Record<string, unknown> = {
        CatalogOfferingsAncillaryListResponse: {
          CatalogOfferingsID: [],
        },
      };
      expect(service.parseAncillaryShopResponse(empty)).toEqual([]);
    });

    it('handles single-object instead of array for CatalogOfferingsID', () => {
      const response: Record<string, unknown> = {
        CatalogOfferingsAncillaryListResponse: {
          Identifier: { value: 'resp-1' },
          CatalogOfferingsID: {
            Identifier: { value: 'co-id-1' },
            CatalogOffering: {
              Identifier: { value: 'co-offer-1' },
              Price: { TotalPrice: 100, CurrencyCode: { value: 'USD' } },
              ProductOptions: {
                Product: shopProduct('bg1', 'Baggage', 'Extra Bag', 50),
              },
            },
          },
        },
      };
      const options = service.parseAncillaryShopResponse(response);
      expect(options).toHaveLength(1);
      expect(options[0].type).toBe('baggage');
    });

    it('deduplicates products with same ID', () => {
      const response = wrapResponse([
        shopProduct('dup1', 'Baggage', 'Same Bag', 50),
        shopProduct('dup1', 'Baggage', 'Same Bag (dup)', 50),
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options).toHaveLength(1);
    });

    it('does not crash on malformed product data', () => {
      const response = wrapResponse([
        { '@type': 'BadProduct', notAnId: 'nope' }, // no 'id' field
        { id: 'good1', '@type': 'Baggage', name: 'Good Bag', Price: { TotalPrice: 30, CurrencyCode: { value: 'USD' } } },
      ]);
      const options = service.parseAncillaryShopResponse(response);
      expect(options).toHaveLength(1);
      expect(options[0].supplier.productIdentifier).toBe('good1');
    });

    it('handles null price gracefully', () => {
      const response = wrapResponse([shopProduct('bg1', 'Baggage', 'No Price Bag')]); // no Price block
      const options = service.parseAncillaryShopResponse(response);
      // Should use offering-level default price
      expect(options).toHaveLength(1);
      expect(options[0].price.amount).toBe(100); // from offering's TotalPrice
    });
  });
});
