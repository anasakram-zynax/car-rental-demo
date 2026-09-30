import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';
import {
  CarBookingRepositoryPortToken,
  type CarBookingRepositoryPort,
} from '../ports/car-booking-repository.port';
import {
  CarFleetRepositoryPortToken,
  type CarFleetRepositoryPort,
} from '../ports/car-fleet-repository.port';
import {
  CarLocationRepositoryPortToken,
  type CarLocationRepositoryPort,
} from '../ports/car-location-repository.port';
import {
  CarTransferPackageRepositoryPortToken,
  type CarTransferPackageRepositoryPort,
} from '../ports/car-transfer-package-repository.port';
import type { CarFleetEntity } from '../../domain/entities/car-fleet.entity';
import type {
  CarLocationEntity,
  CarLocationType,
  CreateCarLocationInput,
} from '../../domain/entities/car-location.entity';
import {
  CAR_RENTAL_RESERVING_STATUSES,
  calculateRentalAvailability,
} from '../../domain/rental-availability.policy';

export interface CarFleetImageInput {
  url: string;
  isDefault?: boolean;
}
export interface CarLocationInput {
  label: string;
  name: string;
  city: string;
  region?: string;
  country: string;
  type: CarLocationType;
  code?: string;
}
export interface CreateCarFleetCommand {
  displayName: string;
  brand?: string;
  model?: string;
  category: string;
  description?: string;
  amenities?: string[];
  passengerCapacity: number;
  luggageCapacity?: number;
  transmission?: string;
  quantity: number;
  rentalEnabled: boolean;
  transferEnabled: boolean;
  rentalPrice?: number;
  currency: string;
  location: CarLocationInput;
  images?: CarFleetImageInput[];
  isActive?: boolean;
  displayOrder?: number;
}
export type UpdateCarFleetCommand = Partial<CreateCarFleetCommand>;
export interface CarSearchQuery {
  serviceType: string;
  location?: string;
  locationId?: string;
  pickupLocationId?: string;
  dropoffLocationId?: string;
  pickupAt?: string;
  dropoffAt?: string;
  returnAt?: string;
  category?: string;
  passengerCapacity?: number;
  luggageCapacity?: number;
  quantity?: number;
  transmission?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'recommended' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
}

export interface ReserveRentalCommand {
  publicRef: string;
  fleetId: string;
  userId?: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupAt: string | Date;
  dropoffAt: string | Date;
  quantity: number;
  customerSnapshot?: Record<string, unknown>;
}

export interface ReserveTransferCommand {
  publicRef: string;
  transferPackageId: string;
  userId?: string;
  pickupAt: string | Date;
  quantity: number;
  customerSnapshot?: Record<string, unknown>;
}

@Injectable()
export class CarsService {
  constructor(
    @Inject(CarFleetRepositoryPortToken)
    private readonly fleetRepository: CarFleetRepositoryPort,
    @Inject(CarLocationRepositoryPortToken)
    private readonly locationRepository: CarLocationRepositoryPort,
    @Inject(CarTransferPackageRepositoryPortToken)
    private readonly transferPackageRepository: CarTransferPackageRepositoryPort,
    @Inject(CarBookingRepositoryPortToken)
    private readonly bookingRepository: CarBookingRepositoryPort,
  ) {}

  async create(input: CreateCarFleetCommand) {
    const normalized = this.normalizeFleetCommand(input);
    this.validateFleetConfiguration(normalized);
    const location = await this.locationRepository.findOrCreate(
      this.normalizeLocation(input.location),
    );
    const normalizedDisplayName = this.normalizeIdentity(input.displayName);
    await this.assertNoDuplicate(normalizedDisplayName, location.id);
    return this.fleetRepository.create({
      displayName: input.displayName.trim(),
      normalizedDisplayName,
      brand: this.optionalTrim(input.brand),
      model: this.optionalTrim(input.model),
      category: normalized.category,
      description: this.optionalTrim(input.description),
      amenities: this.normalizeAmenities(input.amenities),
      passengerCapacity: input.passengerCapacity,
      luggageCapacity: input.luggageCapacity ?? null,
      transmission: normalized.transmission ?? null,
      quantity: input.quantity,
      rentalEnabled: input.rentalEnabled,
      transferEnabled: input.transferEnabled,
      rentalPrice: input.rentalEnabled ? (input.rentalPrice ?? null) : null,
      currency: input.currency.trim().toUpperCase(),
      locationId: location.id,
      images: input.images ?? null,
      isActive: input.isActive ?? true,
      displayOrder: input.displayOrder ?? 0,
    });
  }

  async update(id: string, input: UpdateCarFleetCommand) {
    const existing = await this.getById(id);
    const location = input.location
      ? await this.locationRepository.findOrCreate(
          this.normalizeLocation(input.location),
        )
      : existing.location;
    const merged: CreateCarFleetCommand = {
      displayName: input.displayName ?? existing.displayName,
      brand: input.brand ?? existing.brand ?? undefined,
      model: input.model ?? existing.model ?? undefined,
      category: input.category ?? existing.category,
      description: input.description ?? existing.description ?? undefined,
      amenities: input.amenities ?? existing.amenities,
      passengerCapacity: input.passengerCapacity ?? existing.passengerCapacity,
      luggageCapacity:
        input.luggageCapacity ?? existing.luggageCapacity ?? undefined,
      transmission: input.transmission ?? existing.transmission ?? undefined,
      quantity: input.quantity ?? existing.quantity,
      rentalEnabled: input.rentalEnabled ?? existing.rentalEnabled,
      transferEnabled: input.transferEnabled ?? existing.transferEnabled,
      rentalPrice: input.rentalPrice ?? existing.rentalPrice ?? undefined,
      currency: input.currency ?? existing.currency,
      location: this.locationEntityToInput(location),
      images:
        input.images ??
        (existing.images as CarFleetImageInput[] | null) ??
        undefined,
      isActive: input.isActive ?? existing.isActive,
      displayOrder: input.displayOrder ?? existing.displayOrder,
    };
    const normalized = this.normalizeFleetCommand(merged);
    this.validateFleetConfiguration(normalized);
    const normalizedDisplayName = this.normalizeIdentity(merged.displayName);
    await this.assertNoDuplicate(normalizedDisplayName, location.id, id);
    return this.fleetRepository.update(id, {
      displayName: merged.displayName.trim(),
      normalizedDisplayName,
      brand: this.optionalTrim(merged.brand),
      model: this.optionalTrim(merged.model),
      category: normalized.category,
      description: this.optionalTrim(merged.description),
      amenities: this.normalizeAmenities(merged.amenities),
      passengerCapacity: merged.passengerCapacity,
      luggageCapacity: merged.luggageCapacity ?? null,
      transmission: normalized.transmission ?? null,
      quantity: merged.quantity,
      rentalEnabled: merged.rentalEnabled,
      transferEnabled: merged.transferEnabled,
      rentalPrice: merged.rentalEnabled ? (merged.rentalPrice ?? null) : null,
      currency: merged.currency.trim().toUpperCase(),
      locationId: location.id,
      images: merged.images ?? null,
      isActive: merged.isActive ?? true,
      displayOrder: merged.displayOrder ?? 0,
    });
  }

  async getById(id: string): Promise<CarFleetEntity> {
    const fleet = await this.fleetRepository.findById(id);
    if (!fleet)
      throw new BusinessError(
        'CAR_FLEET_NOT_FOUND',
        `Car fleet with id "${id}" not found.`,
      );
    return fleet;
  }

  list(page = 1, pageSize = 20, search?: string) {
    return this.fleetRepository.list({
      page: this.positiveIntegerOr(page, 1),
      pageSize: Math.min(this.positiveIntegerOr(pageSize, 20), 100),
      search: search?.trim() || undefined,
    });
  }

  async deactivate(id: string) {
    await this.getById(id);
    return this.fleetRepository.deactivate(id);
  }

  async search(query: CarSearchQuery) {
    const normalized = this.normalizeSearchQuery(query);
    this.validateSearch(normalized);
    return normalized.serviceType === 'transfer'
      ? this.searchTransfers(normalized)
      : this.searchRentals(normalized);
  }

  async suggestLocations(serviceType: string, query: string, limit = 10) {
    const normalized = serviceType.trim().toLowerCase();
    if (normalized !== 'rental' && normalized !== 'transfer')
      throw new BusinessError(
        'CAR_SEARCH_INVALID_SERVICE_TYPE',
        'Service type must be rental or transfer.',
      );
    const term = query.trim();
    if (term.length < 3)
      throw new BusinessError(
        'CAR_LOCATION_QUERY_TOO_SHORT',
        'Enter at least 3 characters to search Cars locations.',
      );
    return normalized === 'rental'
      ? this.locationRepository.searchRentalLocations(term, limit)
      : this.locationRepository.searchTransferPickupLocations(term, limit);
  }

  async getLocationById(id: string) {
    const location = await this.locationRepository.findById(id);
    if (!location)
      throw new BusinessError(
        'CAR_LOCATION_NOT_FOUND',
        `Car location with id "${id}" not found.`,
        HttpStatus.NOT_FOUND,
      );
    return location;
  }

  findTransferDropoffs(pickupLocationId: string, query?: string) {
    return this.transferPackageRepository.findDropoffLocations(
      pickupLocationId,
      query?.trim() || undefined,
    );
  }

  async getRentalAvailability(
    fleetId: string,
    pickupAtInput: string | Date,
    dropoffAtInput: string | Date,
    requestedQuantity = 1,
  ) {
    const fleet = await this.fleetRepository.findById(fleetId);
    if (!fleet)
      throw new BusinessError(
        'CAR_FLEET_NOT_FOUND',
        `Car fleet with id "${fleetId}" not found.`,
        HttpStatus.NOT_FOUND,
      );
    this.validateRentalFleet(fleet);
    const { pickupAt, dropoffAt } = this.validateRentalWindow(
      pickupAtInput,
      dropoffAtInput,
      requestedQuantity,
    );
    return this.availabilityForFleet(
      fleet,
      pickupAt,
      dropoffAt,
      requestedQuantity,
    );
  }

  async reserveRental(input: ReserveRentalCommand) {
    return this.allocateRental(input, 'booked', false);
  }

  async reserveRentalForCheckout(input: ReserveRentalCommand) {
    return this.allocateRental(input, 'pending_payment', true);
  }

  async reserveTransferForCheckout(input: ReserveTransferCommand) {
    const duplicate = await this.bookingRepository.findByPublicRef(
      input.publicRef.trim(),
    );
    if (duplicate) return duplicate;
    const transferPackage = await this.transferPackageRepository.findById(
      input.transferPackageId,
    );
    if (!transferPackage?.fleet || !transferPackage.isActive)
      throw new BusinessError(
        'CAR_TRANSFER_PACKAGE_UNAVAILABLE',
        'The selected transfer package is no longer available.',
        HttpStatus.CONFLICT,
      );
    if (
      !transferPackage.fleet.isActive ||
      !transferPackage.fleet.transferEnabled
    )
      throw new BusinessError(
        'CAR_TRANSFER_FLEET_UNAVAILABLE',
        'The selected transfer fleet is no longer available.',
        HttpStatus.CONFLICT,
      );
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new BusinessError('CAR_TRANSFER_INVALID_QUANTITY');
    if (input.quantity > transferPackage.fleet.quantity)
      throw new BusinessError(
        'CAR_TRANSFER_INSUFFICIENT_AVAILABILITY',
        `Only ${transferPackage.fleet.quantity} vehicle(s) are available for this transfer.`,
        HttpStatus.CONFLICT,
      );
    const pickupAt = new Date(input.pickupAt);
    if (!Number.isFinite(pickupAt.getTime()))
      throw new BusinessError('CAR_TRANSFER_INVALID_PICKUP_TIME');
    const total = transferPackage.price * input.quantity;
    return this.bookingRepository.create({
      publicRef: input.publicRef.trim(),
      userId: input.userId ?? null,
      fleetId: transferPackage.fleet.id,
      transferPackageId: transferPackage.id,
      serviceType: 'transfer',
      status: 'pending_payment',
      quantity: input.quantity,
      pickupLocation:
        transferPackage.pickupLocation?.label ??
        transferPackage.pickupLocationId,
      dropoffLocation:
        transferPackage.dropoffLocation?.label ??
        transferPackage.dropoffLocationId,
      pickupAt,
      dropoffAt: null,
      rentalDays: null,
      customerSnapshot: input.customerSnapshot ?? {},
      fleetSnapshot: this.toPublicFleet(transferPackage.fleet),
      pricingSnapshot: {
        transferPackageId: transferPackage.id,
        packagePrice: transferPackage.price,
        quantity: input.quantity,
        total,
        currency: transferPackage.currency,
      },
      subtotal: total,
      discount: 0,
      total,
      currency: transferPackage.currency,
      promoCode: null,
      cancelledAt: null,
      cancellationReason: null,
      cancellationFee: 0,
      workflowTrace: null,
    });
  }

  private async allocateRental(
    input: ReserveRentalCommand,
    status: BookingStatus,
    returnDuplicate: boolean,
  ) {
    const fleet = await this.fleetRepository.findById(input.fleetId);
    if (!fleet)
      throw new BusinessError(
        'CAR_FLEET_NOT_FOUND',
        `Car fleet with id "${input.fleetId}" not found.`,
        HttpStatus.NOT_FOUND,
      );
    const { pickupAt, dropoffAt } = this.validateRentalWindow(
      input.pickupAt,
      input.dropoffAt,
      input.quantity,
    );
    const rentalDays = Math.ceil(
      (dropoffAt.getTime() - pickupAt.getTime()) / 86_400_000,
    );
    const subtotal = (fleet.rentalPrice ?? 0) * rentalDays * input.quantity;
    const result = await this.bookingRepository.allocateRental({
      statuses: CAR_RENTAL_RESERVING_STATUSES,
      booking: {
        publicRef: input.publicRef.trim(),
        userId: input.userId ?? null,
        fleetId: fleet.id,
        transferPackageId: null,
        serviceType: 'rental',
        status,
        quantity: input.quantity,
        pickupLocation: input.pickupLocation,
        dropoffLocation: input.dropoffLocation,
        pickupAt,
        dropoffAt,
        rentalDays,
        customerSnapshot: input.customerSnapshot ?? {},
        fleetSnapshot: this.toPublicFleet(fleet),
        pricingSnapshot: {
          rentalPrice: fleet.rentalPrice,
          rentalDays,
          quantity: input.quantity,
          pickupAt: pickupAt.toISOString(),
          dropoffAt: dropoffAt.toISOString(),
          pickupLocation: input.pickupLocation,
          dropoffLocation: input.dropoffLocation,
          total: subtotal,
          currency: fleet.currency,
        },
        subtotal,
        discount: 0,
        total: subtotal,
        currency: fleet.currency,
        promoCode: null,
        cancelledAt: null,
        cancellationReason: null,
        cancellationFee: 0,
        workflowTrace: null,
      },
    });

    if (result.outcome === 'created') return result.booking;
    if (result.outcome === 'duplicate' && returnDuplicate)
      return result.booking;
    if (result.outcome === 'duplicate')
      throw new BusinessError(
        'CAR_RENTAL_DUPLICATE_ALLOCATION',
        'This rental allocation reference already exists.',
        HttpStatus.CONFLICT,
      );
    if (result.outcome === 'fleet_not_found')
      throw new BusinessError(
        'CAR_FLEET_NOT_FOUND',
        `Car fleet with id "${input.fleetId}" not found.`,
        HttpStatus.NOT_FOUND,
      );
    if (result.outcome === 'fleet_inactive')
      throw new BusinessError(
        'CAR_RENTAL_FLEET_INACTIVE',
        'The selected fleet is inactive.',
        HttpStatus.CONFLICT,
      );
    if (result.outcome === 'rental_disabled')
      throw new BusinessError(
        'CAR_RENTAL_DISABLED',
        'Rental service is disabled for this fleet.',
        HttpStatus.CONFLICT,
      );
    if (result.outcome === 'insufficient')
      throw new BusinessError(
        'CAR_RENTAL_INSUFFICIENT_AVAILABILITY',
        'The requested rental quantity is no longer available.',
        HttpStatus.CONFLICT,
        {
          totalQuantity: result.totalQuantity,
          reservedQuantity: result.reservedQuantity,
        },
      );
    throw new BusinessError('CAR_RENTAL_ALLOCATION_FAILED');
  }

  private async searchRentals(query: CarSearchQuery) {
    const result = await this.fleetRepository.list({
      page: this.positiveIntegerOr(query.page, 1),
      pageSize: Math.min(this.positiveIntegerOr(query.pageSize, 20), 100),
      isActive: true,
      serviceType: 'rental',
      rentalEnabled: true,
      location: query.location?.trim(),
      locationId: query.locationId,
      category: query.category,
      passengerCapacity: query.passengerCapacity,
      luggageCapacity: query.luggageCapacity,
      transmission: query.transmission,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
    });
    const pickupAt = new Date(query.pickupAt!);
    const dropoffAt = new Date(query.dropoffAt ?? query.returnAt!);
    const requestedQuantity = query.quantity ?? 1;
    const withAvailability = await Promise.all(
      result.items.map(async (fleet) => ({
        ...this.toPublicFleet(fleet),
        serviceType: 'rental' as const,
        price: fleet.rentalPrice,
        availability: await this.availabilityForFleet(
          fleet,
          pickupAt,
          dropoffAt,
          requestedQuantity,
        ),
      })),
    );
    return {
      ...result,
      items: withAvailability.filter((item) => item.availability.isAvailable),
    };
  }

  private async searchTransfers(query: CarSearchQuery) {
    const result = await this.transferPackageRepository.search({
      pickupLocationId: query.pickupLocationId!,
      dropoffLocationId: query.dropoffLocationId,
      passengerCapacity: query.passengerCapacity,
      luggageCapacity: query.luggageCapacity,
      category: query.category,
      transmission: query.transmission,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      page: this.positiveIntegerOr(query.page, 1),
      pageSize: Math.min(this.positiveIntegerOr(query.pageSize, 20), 100),
    });
    return {
      ...result,
      items: result.items.map((item) => ({
        packageId: item.id,
        serviceType: 'transfer' as const,
        fleet: this.toPublicFleet(item.fleet!),
        pickupLocation: item.pickupLocation,
        dropoffLocation: item.dropoffLocation,
        price: item.price,
        currency: item.currency,
      })),
    };
  }

  private toPublicFleet(fleet: CarFleetEntity) {
    return {
      id: fleet.id,
      displayName: fleet.displayName,
      brand: fleet.brand,
      model: fleet.model,
      category: fleet.category,
      description: fleet.description,
      amenities: fleet.amenities,
      passengerCapacity: fleet.passengerCapacity,
      luggageCapacity: fleet.luggageCapacity,
      transmission: fleet.transmission,
      images: fleet.images,
      location: fleet.location,
      currency: fleet.currency,
    };
  }

  private normalizeFleetCommand(
    input: CreateCarFleetCommand,
  ): CreateCarFleetCommand {
    return {
      ...input,
      category: input.category.trim().toLowerCase(),
      transmission: input.transmission?.trim().toLowerCase(),
      amenities: this.normalizeAmenities(input.amenities),
    };
  }
  private normalizeAmenities(values?: string[]) {
    if (!values) return [];
    const seen = new Set<string>();
    return values
      .map((value) => value.trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  private normalizeSearchQuery(query: CarSearchQuery): CarSearchQuery {
    return {
      ...query,
      serviceType: query.serviceType.trim().toLowerCase(),
      category: query.category?.trim().toLowerCase(),
      transmission: query.transmission?.trim().toLowerCase(),
    };
  }
  private normalizeLocation(input: CarLocationInput): CreateCarLocationInput {
    const code = this.optionalTrim(input.code)?.toUpperCase() ?? null;
    const type = input.type.trim().toLowerCase() as CarLocationType;
    const label = input.label.trim();
    const name = input.name.trim();
    const city = input.city.trim();
    const country = input.country.trim();
    const region = this.optionalTrim(input.region);
    const identity = code
      ? `${type}:${code}:${this.normalizeIdentity(country)}`
      : [type, name, city, region, country]
          .map((part) => this.normalizeIdentity(part ?? ''))
          .join(':');
    return { identity, label, name, city, region, country, type, code };
  }
  private locationEntityToInput(location: CarLocationEntity): CarLocationInput {
    return {
      label: location.label,
      name: location.name,
      city: location.city,
      region: location.region ?? undefined,
      country: location.country,
      type: location.type,
      code: location.code ?? undefined,
    };
  }
  private async assertNoDuplicate(
    normalizedDisplayName: string,
    locationId: string,
    excludeId?: string,
  ) {
    if (
      await this.fleetRepository.findDuplicate(
        normalizedDisplayName,
        locationId,
        excludeId,
      )
    )
      throw new BusinessError(
        'CAR_FLEET_DUPLICATE',
        'A fleet with this display name already exists at this location.',
        HttpStatus.CONFLICT,
      );
  }

  private validateFleetConfiguration(input: CreateCarFleetCommand) {
    if (!input.displayName.trim() || !input.category.trim())
      throw new BusinessError(
        'CAR_FLEET_INVALID',
        'Display name and category are required.',
      );
    if (!input.location?.label.trim() || !input.location.city.trim())
      throw new BusinessError(
        'CAR_FLEET_INVALID_LOCATION',
        'A structured Cars location is required.',
      );
    if (!/^[A-Za-z]{3}$/.test(input.currency.trim()))
      throw new BusinessError(
        'CAR_FLEET_INVALID_CURRENCY',
        'Currency must be a three-letter code.',
      );
    if (
      (input.amenities?.length ?? 0) > 20 ||
      input.amenities?.some((amenity) => amenity.length > 80)
    )
      throw new BusinessError(
        'CAR_FLEET_INVALID_AMENITIES',
        'Amenities may contain up to 20 items of 80 characters each.',
      );
    if (
      !Number.isInteger(input.passengerCapacity) ||
      input.passengerCapacity < 1
    )
      throw new BusinessError(
        'CAR_FLEET_INVALID_CAPACITY',
        'Passenger capacity must be a positive integer.',
      );
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new BusinessError(
        'CAR_FLEET_INVALID_QUANTITY',
        'Quantity must be a positive integer.',
      );
    if (!input.rentalEnabled && !input.transferEnabled)
      throw new BusinessError(
        'CAR_FLEET_SERVICE_REQUIRED',
        'At least one Cars service type must be enabled.',
      );
    if (input.rentalEnabled && input.rentalPrice === undefined)
      throw new BusinessError(
        'CAR_FLEET_RENTAL_PRICE_REQUIRED',
        'Rental price is required when rental service is enabled.',
      );
    for (const amount of [input.rentalPrice])
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0))
        throw new BusinessError(
          'CAR_FLEET_INVALID_PRICE',
          'Cars prices must be non-negative readable values.',
        );
    if (
      input.transmission &&
      !['automatic', 'manual'].includes(input.transmission)
    )
      throw new BusinessError(
        'CAR_FLEET_INVALID_TRANSMISSION',
        'Transmission must be automatic or manual.',
      );
  }

  private validateSearch(query: CarSearchQuery) {
    if (query.serviceType !== 'rental' && query.serviceType !== 'transfer')
      throw new BusinessError(
        'CAR_SEARCH_INVALID_SERVICE_TYPE',
        'Service type must be rental or transfer.',
      );
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BusinessError(
        'CAR_SEARCH_INVALID_PRICE_RANGE',
        'Minimum price cannot exceed maximum price.',
      );
    if (query.quantity !== undefined && query.quantity <= 0)
      throw new BusinessError(
        'CAR_RENTAL_INVALID_QUANTITY',
        'Requested rental quantity must be a positive integer.',
      );
    if (query.serviceType === 'rental') {
      if (!query.location?.trim() && !query.locationId)
        throw new BusinessError(
          'CAR_SEARCH_LOCATION_REQUIRED',
          'Rental location is required.',
        );
      const returnAt = query.dropoffAt ?? query.returnAt;
      if (!query.pickupAt || !returnAt)
        throw new BusinessError(
          'CAR_SEARCH_RENTAL_DATES_REQUIRED',
          'Rental pickup and drop-off timestamps are required.',
        );
      const pickup = new Date(query.pickupAt);
      const dropoff = new Date(returnAt);
      if (
        !Number.isFinite(pickup.getTime()) ||
        !Number.isFinite(dropoff.getTime()) ||
        pickup >= dropoff
      )
        throw new BusinessError(
          'CAR_SEARCH_INVALID_RENTAL_DATES',
          'Rental pickup must be before drop-off.',
        );
    } else if (
      !query.pickupAt ||
      !query.pickupLocationId ||
      !query.dropoffLocationId
    )
      throw new BusinessError(
        'CAR_SEARCH_TRANSFER_ROUTE_REQUIRED',
        'Transfer pickup time and selected pickup/drop-off locations are required.',
      );
  }

  private async availabilityForFleet(
    fleet: CarFleetEntity,
    pickupAt: Date,
    dropoffAt: Date,
    requestedQuantity: number,
  ) {
    const reservedQuantity =
      await this.bookingRepository.sumOverlappingRentalQuantity({
        fleetId: fleet.id,
        pickupAt,
        dropoffAt,
        statuses: CAR_RENTAL_RESERVING_STATUSES,
      });
    return calculateRentalAvailability({
      totalQuantity: fleet.quantity,
      reservedQuantity,
      requestedQuantity,
    });
  }

  private validateRentalFleet(fleet: CarFleetEntity) {
    if (!fleet.isActive)
      throw new BusinessError(
        'CAR_RENTAL_FLEET_INACTIVE',
        'The selected fleet is inactive.',
        HttpStatus.CONFLICT,
      );
    if (!fleet.rentalEnabled)
      throw new BusinessError(
        'CAR_RENTAL_DISABLED',
        'Rental service is disabled for this fleet.',
        HttpStatus.CONFLICT,
      );
  }

  private validateRentalWindow(
    pickupAtInput: string | Date,
    dropoffAtInput: string | Date,
    requestedQuantity: number,
  ) {
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0)
      throw new BusinessError(
        'CAR_RENTAL_INVALID_QUANTITY',
        'Requested rental quantity must be a positive integer.',
      );
    const pickupAt = new Date(pickupAtInput);
    const dropoffAt = new Date(dropoffAtInput);
    if (
      !Number.isFinite(pickupAt.getTime()) ||
      !Number.isFinite(dropoffAt.getTime()) ||
      pickupAt >= dropoffAt
    )
      throw new BusinessError(
        'CAR_SEARCH_INVALID_RENTAL_DATES',
        'Rental pickup must be before drop-off.',
      );
    return { pickupAt, dropoffAt };
  }

  private normalizeIdentity(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }
  private positiveIntegerOr(value: number | undefined, fallback: number) {
    return Number.isInteger(value) && (value as number) > 0
      ? (value as number)
      : fallback;
  }
}
