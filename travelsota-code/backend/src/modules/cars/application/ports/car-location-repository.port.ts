import type {
  CarLocationEntity,
  CreateCarLocationInput,
} from '../../domain/entities/car-location.entity';

export interface CarLocationRepositoryPort {
  findById(id: string): Promise<CarLocationEntity | null>;
  findByIdentity(identity: string): Promise<CarLocationEntity | null>;
  create(data: CreateCarLocationInput): Promise<CarLocationEntity>;
  findOrCreate(data: CreateCarLocationInput): Promise<CarLocationEntity>;
  searchRentalLocations(
    query: string,
    limit?: number,
  ): Promise<CarLocationEntity[]>;
  searchTransferPickupLocations(
    query: string,
    limit?: number,
  ): Promise<CarLocationEntity[]>;
}

export const CarLocationRepositoryPortToken = Symbol(
  'CarLocationRepositoryPort',
);
