import { Injectable, Logger } from '@nestjs/common';
import type {
  AncillaryCatalogOption,
  AncillaryCatalogType,
  AncillaryCatalogSource,
  AncillaryMoney,
} from '../../domain/entities/ancillary-catalog.types';

/**
 * Phase 4 — Parse and Normalize Travelport Ancillary Shop Response
 *
 * Converts a Travelport CatalogOfferingsAncillaryListResponse from the
 * ancillary shop endpoint into structured AncillaryCatalogOption[] arrays.
 */
@Injectable()
export class AncillaryCatalogParserService {
  private readonly logger = new Logger(AncillaryCatalogParserService.name);

  /**
   * Public entry point: parse ancillary shop response into options.
   */
  parseAncillaryShopResponse(
    raw: Record<string, unknown>,
    source: AncillaryCatalogSource = 'ancillaryshop',
    includeSeats = false,
  ): AncillaryCatalogOption[] {
    const options: AncillaryCatalogOption[] = [];
    const seen = new Set<string>();

    const topKeys =
      raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : 'N/A';
    this.logger.log(
      `[Parser] parseAncillaryShopResponse source=${source} includeSeats=${includeSeats} topKeys=[${topKeys}]`,
    );

    try {
      const listResponse = raw.CatalogOfferingsAncillaryListResponse as
        | Record<string, unknown>
        | undefined;
      if (!listResponse) {
        this.logger.warn(
          `[Parser] No CatalogOfferingsAncillaryListResponse found in response — raw snippet=${JSON.stringify(raw).slice(0, 500)}`,
        );
        return options;
      }
      const listKeys = Object.keys(listResponse).join(', ');
      this.logger.log(
        `[Parser] CatalogOfferingsAncillaryListResponse keys=[${listKeys}]`,
      );

      // Phase 2: Capture response-level Identifier.value (used for baggage/services add)
      const responseCatalogOfferingsIdentifier = this.readNestedString(
        listResponse,
        ['Identifier', 'value'],
      );
      this.logger.log(
        `[Parser] responseCatalogOfferingsIdentifier=${responseCatalogOfferingsIdentifier ?? '(none)'}`,
      );

      let catalogOfferingsIdArray = this.toArray(
        listResponse.CatalogOfferingsID as Record<string, unknown>[],
      );
      this.logger.log(
        `[Parser] CatalogOfferingsID count=${catalogOfferingsIdArray.length}`,
      );

      // Fallback: BuildFromReservationWorkbench response has flat CatalogOffering[]
      // without the CatalogOfferingsID wrapper.
      if (catalogOfferingsIdArray.length === 0) {
        const directOfferings = this.toArray(
          listResponse.CatalogOffering as Record<string, unknown>[],
        );
        if (directOfferings.length > 0) {
          this.logger.log(
            `[Parser] No CatalogOfferingsID — using direct CatalogOffering[] (workbench format): ${directOfferings.length} offerings`,
          );
          catalogOfferingsIdArray = [{ CatalogOffering: directOfferings }];
        }
      }

      let offeringIndex = 0;

      for (const catalogOfferingsId of catalogOfferingsIdArray) {
        // CatalogOfferingsID-level identifier (may be needed for seat add)
        const catalogOfferingsIdIdentifier = this.readNestedString(
          catalogOfferingsId,
          ['Identifier', 'value'],
        );
        const catalogOfferings = this.toArray(
          catalogOfferingsId.CatalogOffering as Record<string, unknown>[],
        );
        this.logger.log(
          `[Parser] CatalogOfferingsID ident=${catalogOfferingsIdIdentifier ?? '(none)'} CatalogOffering count=${catalogOfferings.length}`,
        );

        for (const offering of catalogOfferings) {
          // Extract offering-level identifiers
          // CatalogOffering.id — used for baggage/services add
          const catalogOfferingId = this.readString(offering.id);
          // CatalogOffering.Identifier.value — used for seat add
          const catalogOfferingIdentifierValue = this.readNestedString(
            offering,
            ['Identifier', 'value'],
          );
          const price = this.extractPrice(
            offering.Price as Record<string, unknown> | undefined,
          );
          this.logger.log(
            `[Parser] Offering id=${catalogOfferingId ?? '(none)'} ident=${catalogOfferingIdentifierValue ?? '(none)'} price=${JSON.stringify(price)}`,
          );

          const productOptions = this.toArray(
            offering.ProductOptions as Record<string, unknown>[],
          );
          this.logger.log(
            `[Parser] ProductOptions count=${productOptions.length}`,
          );
          let productCount = 0;

          for (const productOption of productOptions) {
            const products = this.toArray(
              productOption.Product as Record<string, unknown>[],
            );
            this.logger.log(
              `[Parser] ProductOption -> Product count=${products.length}`,
            );

            for (const product of products) {
              productCount++;
              const productType = this.readString(product['@type']) ?? '';

              // Handle ProductSeatAvailability specially — no product.id, expand SeatAvailability[]
              if (includeSeats && productType === 'ProductSeatAvailability') {
                const seatAvailabilityArray = this.toArray(
                  product.SeatAvailability as Record<string, unknown>[],
                );
                const brandName =
                  this.readNestedString(product, ['Brand', 'name']) ??
                  'Standard';
                const productRealId = this.readString(product.id);
                let seatCount = 0;

                for (const seatGroup of seatAvailabilityArray) {
                  const status =
                    this.readString(seatGroup.seatAvailabilityStatus) ??
                    'Unknown';
                  const seatNames = this.toStringArray(
                    seatGroup.value as string[] | undefined,
                  );
                  const paidSeatInd = seatGroup.paidSeatInd === true;
                  for (const seatName of seatNames) {
                    seatCount++;
                    const syntheticId = `${catalogOfferingIdentifierValue ?? 'seat'}:${brandName}:${seatName}`;
                    if (seen.has(syntheticId)) continue;
                    seen.add(syntheticId);

                    options.push({
                      id: `seat:${syntheticId}`,
                      type: 'seat',
                      source,
                      label: `${brandName} — ${seatName}`,
                      description:
                        status === 'Available' ? undefined : 'Unavailable',
                      price: price ?? { amount: 0, currency: 'USD' },
                      requiresSupplierConfirmation: false,
                      quantityMin: 0,
                      quantityMax: 1,
                      supplier: {
                        catalogOfferingsIdentifier:
                          responseCatalogOfferingsIdentifier,
                        catalogOfferingsIdIdentifier,
                        catalogOfferingIdentifier: catalogOfferingId,
                        catalogOfferingIdentifierValue,
                        productIdentifier: productRealId ?? syntheticId,
                        productIdentifierSynthetic: syntheticId,
                        seatAssignment: seatName,
                        brandName,
                      },
                      raw: { seatName, status, brand: brandName, catalogOfferingId },
                    });
                  }
                }

                this.logger.log(
                  `[Parser] Product #${productCount}: type=ProductSeatAvailability brand=${brandName} seats=${seatCount} (${seatAvailabilityArray.length} groups)`,
                );
                continue;
              }

              // Skip seat availability products unless includeSeats is true
              if (!includeSeats) {
                if (
                  productType.includes('Seat') &&
                  product.SeatAvailability !== undefined
                ) {
                  this.logger.log(
                    `[Parser] Product #${productCount}: type=${productType} id=${this.readString(product.id) ?? '(none)'} — SKIPPED (SeatAvailability)`,
                  );
                  continue;
                }
                if (productType === 'ProductSeatAvailability') {
                  this.logger.log(
                    `[Parser] Product #${productCount}: type=ProductSeatAvailability — SKIPPED`,
                  );
                  continue;
                }
              }

              const productId = this.readString(product.id);
              if (!productId || seen.has(productId)) {
                if (productId)
                  this.logger.log(
                    `[Parser] Product #${productCount}: duplicate id=${productId} — SKIPPED`,
                  );
                continue;
              }
              seen.add(productId);
              this.logger.log(
                `[Parser] Product #${productCount}: type=${productType} id=${productId} name=${this.readString(product.name) ?? this.readString(product.serviceName) ?? '(unnamed)'}`,
              );

              const option = this.buildOption(product, {
                catalogOfferingsIdentifier: responseCatalogOfferingsIdentifier,
                catalogOfferingsIdIdentifier,
                catalogOfferingIdentifier: catalogOfferingId,
                catalogOfferingIdentifierValue,
                productId,
                defaultPrice: price,
                source,
              });

              if (option) {
                this.logger.log(
                  `[Parser] Built option: type=${option.type} id=${option.id} label=${option.label}`,
                );
                options.push(option);
              } else {
                this.logger.log(
                  `[Parser] buildOption returned null for product id=${productId} type=${productType}`,
                );
              }
            }
          }
          this.logger.log(
            `[Parser] Offering ${catalogOfferingId ?? '(none)'}: processed ${productCount} products, yielded ${options.length} options so far`,
          );
          offeringIndex++;
        }
      }
    } catch (err) {
      this.logger.warn(
        `[AncillaryCatalogParser] Parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Log type breakdown
    const byType: Record<string, number> = {};
    for (const o of options) {
      byType[o.type] = (byType[o.type] ?? 0) + 1;
    }
    this.logger.log(
      `[Parser] parseAncillaryShopResponse done — ${options.length} total options: ${JSON.stringify(byType)}`,
    );

    return options;
  }

  /**
   * Build a single AncillaryCatalogOption from a Travelport Product entry.
   */
  private buildOption(
    product: Record<string, unknown>,
    ctx: {
      catalogOfferingsIdentifier?: string;
      catalogOfferingsIdIdentifier?: string;
      catalogOfferingIdentifier?: string;
      catalogOfferingIdentifierValue?: string;
      productId: string;
      defaultPrice: { amount: number; currency: string } | null;
      source: AncillaryCatalogSource;
    },
  ): AncillaryCatalogOption | null {
    const productType = this.readString(product['@type']) ?? '';
    const name =
      this.readString(product.name) ??
      this.readString(product.serviceName) ??
      '';
    const description =
      this.readString(product.description) ??
      this.readString(product.Text) ??
      '';
    const brandName = this.readNestedString(product, ['Brand', 'name']);
    // Fallback: read Ancillary.Description[0].value for services without explicit name
    const ancillaryName = this.readNestedString(product, ['Ancillary', 'Description', 0, 'value']);
    const ancillaryCode = this.readNestedString(product, ['Ancillary', 'Description', 0, 'code']);

    // Determine the display label — never allow empty or whitespace-only
    const label =
      (brandName && brandName.trim()) ||
      (name && name.trim()) ||
      (ancillaryName && ancillaryName.trim()) ||
      (ancillaryCode && ancillaryCode.trim()) ||
      ctx.productId ||
      'Service';

    // Classify the product type based on name, type, description, and characteristics
    const type = this.classifyProductType(productType, label, description);
    if (!type) return null; // Skip unclassifiable products without identifiers

    // Extract price (product-level overrides offering-level)
    const price = this.extractPrice(
      product.Price as Record<string, unknown> | undefined,
    ) ??
      ctx.defaultPrice ?? { amount: 0, currency: 'USD' };

    // Extract traveler reference if present
    const travelerId =
      this.readNestedString(product, ['TravelerIdentifier', 'id']) ??
      this.readNestedString(product, ['TravelerIdentifierRef', 'value']) ??
      this.readNestedString(product, ['TravelerIdentifierRef', 'id']);

    // Check if this product is included in the offer price
    const includedInOfferPrice = this.isIncluded(product);

    // Extract quantity rules
    const quantity = this.extractQuantity(product);

    // Build supplier identifiers with all identifier levels
    const supplierIdentifiers = {
      catalogOfferingsIdentifier: ctx.catalogOfferingsIdentifier,
      catalogOfferingsIdIdentifier: ctx.catalogOfferingsIdIdentifier,
      catalogOfferingIdentifier: ctx.catalogOfferingIdentifier,
      catalogOfferingIdentifierValue: ctx.catalogOfferingIdentifierValue,
      productIdentifier: ctx.productId,
      travelerIdentifierRef: travelerId,
    };

    return {
      id: `${type}:${ctx.productId}`,
      type,
      source: ctx.source,
      label,
      description: description || undefined,
      price,
      includedInOfferPrice,
      requiresSupplierConfirmation: false,
      quantityMin: quantity.min,
      quantityMax: quantity.max,
      segmentRef: ctx.catalogOfferingIdentifierValue,
      supplier: supplierIdentifiers,
      travelerRef: travelerId ?? undefined,
      raw: product,
    };
  }

  /**
   * Classify a product into AncillaryCatalogType based on its type, label, and description.
   */
  private classifyProductType(
    productType: string,
    label: string,
    description: string,
  ): AncillaryCatalogType | null {
    const searchText = `${productType} ${label} ${description}`.toLowerCase();

    // Seat — classify ProductSeatAvailability or products with 'Seat' in type
    if (/seat/.test(productType.toLowerCase())) {
      return 'seat';
    }

    // Sports equipment — check before baggage to avoid false positives (e.g. "Ski Bag" is sports, not baggage)
    if (
      /\b(sport|golf|ski\b|bicycle|bike|equipment|surfboard|snowboard)\b/.test(
        searchText,
      )
    ) {
      return 'sports_equipment';
    }

    // Baggage
    if (
      /\b(baggage|bag\b|checked\s*bag|carry\s*on|excess\s*bag|luggage|suitcase)\b/.test(
        searchText,
      )
    ) {
      return 'baggage';
    }

    // Priority / boarding
    if (/\b(priority|boarding|fast\s*track|preferential)\b/.test(searchText)) {
      return 'priority';
    }

    // Lounge
    if (/\b(lounge)\b/.test(searchText)) {
      return 'lounge';
    }

    // Wi-Fi
    if (/\b(wifi|wi-?fi|internet|connectivity)\b/.test(searchText)) {
      return 'wifi';
    }

    // Pet
    if (/\b(pet|animal|dog\b|cat\b|crate)\b/.test(searchText)) {
      return 'pet';
    }

    // Meal — only classify as meal from ancillary shop if explicitly a meal product
    if (/\b(meal|dining|food|snack|refreshment)\b/.test(searchText)) {
      return 'meal';
    }

    // If we have a valid product ID but can't classify, return 'other'
    return 'other';
  }

  /**
   * Determine if a product is included in the offer price (not an upsell).
   */
  private isIncluded(product: Record<string, unknown>): boolean {
    // Check for included indicator on the product or its price
    const included =
      this.readString(product.includedIndicator) ??
      this.readString(product.IncludedIndicator);
    if (included === 'true' || included === 'True') return true;

    // If total price is 0, it might be included
    const price = this.extractPrice(
      product.Price as Record<string, unknown> | undefined,
    );
    if (price && price.amount === 0) return true;

    return false;
  }

  /**
   * Extract quantity min/max from a product.
   */
  private extractQuantity(product: Record<string, unknown>): {
    min?: number;
    max?: number;
  } {
    const result: { min?: number; max?: number } = {};

    // Try product-level quantity fields
    const qty = this.readNumber(product.Quantity);
    if (qty !== undefined) {
      result.max = qty;
      result.min = qty;
    }

    const minQty = this.readNumber(product.minQuantity);
    if (minQty !== undefined) result.min = minQty;

    const maxQty = this.readNumber(product.maxQuantity);
    if (maxQty !== undefined) result.max = maxQty;

    return result;
  }

  /**
   * Extract price from a Travelport Price block or product-level fields.
   */
  private extractPrice(
    priceBlock: Record<string, unknown> | undefined,
  ): { amount: number; currency: string } | null {
    if (!priceBlock) return null;

    // Try Price -> TotalPrice / Base / PriceBreakdown
    const totalPrice =
      this.readNumber(priceBlock.TotalPrice) ??
      this.readNumber(priceBlock.Base) ??
      this.readNumber(priceBlock.totalPrice) ??
      this.readNumber(priceBlock.totalAmount) ??
      this.readNestedPriceBreakdown(
        priceBlock.PriceBreakdown as Record<string, unknown> | undefined,
      );

    const currency =
      this.readString(
        this.readNestedString(
          priceBlock.CurrencyCode as Record<string, unknown> | undefined,
          ['value'],
        ) ??
          this.readString(priceBlock.currency) ??
          this.readString(priceBlock.Currency) ??
          this.extractCurrencyFromPriceBreakdown(
            priceBlock.PriceBreakdown as Record<string, unknown> | undefined,
          ),
      ) ?? 'USD';

    if (totalPrice === undefined || totalPrice === null) return null;
    return { amount: totalPrice, currency };
  }

  // ── Helpers ──

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  }

  /** Extract currency code from PriceBreakdown array (e.g. PriceBreakdown[].Amount.CurrencyCode.value) */
  private extractCurrencyFromPriceBreakdown(
    priceBreakdown: Record<string, unknown> | undefined,
  ): string | undefined {
    if (!priceBreakdown) return undefined;
    const breakdowns = this.toArray(priceBreakdown);
    for (const bd of breakdowns) {
      if (bd && typeof bd === 'object') {
        const currency = this.readNestedString(bd as Record<string, unknown>, [
          'Amount',
          'CurrencyCode',
          'value',
        ]);
        if (currency) return currency;
      }
    }
    return undefined;
  }

  /** Extract total price from PriceBreakdown array (e.g. PriceBreakdown[].Amount.Total) */
  private readNestedPriceBreakdown(
    priceBreakdown: Record<string, unknown> | undefined,
  ): number | undefined {
    if (!priceBreakdown) return undefined;
    const breakdowns = this.toArray(priceBreakdown);
    for (const bd of breakdowns) {
      if (bd && typeof bd === 'object') {
        const amount = (bd as Record<string, unknown>).Amount as
          | Record<string, unknown>
          | undefined;
        if (amount) {
          const total = this.readNumber(amount.Total);
          if (total !== undefined) return total;
        }
      }
    }
    return undefined;
  }

  private readNestedString(
    obj: Record<string, unknown> | undefined,
    keys: (string | number)[],
  ): string | undefined {
    if (!obj) return undefined;
    let current: unknown = obj;
    for (const key of keys) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[String(key)];
    }
    return this.readString(current);
  }

  private toArray<T>(value: T | T[] | undefined | null): T[] {
    if (Array.isArray(value)) return value;
    return value != null ? [value] : [];
  }

  private toStringArray(value: string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
}
