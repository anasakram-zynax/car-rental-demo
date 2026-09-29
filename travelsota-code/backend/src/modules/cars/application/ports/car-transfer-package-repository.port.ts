import type {
  CarTransferPackageEntity,
  CreateCarTransferPackageInput,
  UpdateCarTransferPackageInput,
} from '../../domain/entities/car-transfer-package.entity';
import type { CarLocationEntity } from '../../domain/entities/car-location.entity';

export interface TransferPackageSearchCriteria {
  pickupLocationId: string;
  dropoffLocationId?: string;
  passengerCapacity?: number;
  category?: string;
  transmission?: string;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  pageSize: number;
}

export interface TransferPackageSearchResult {
  items: CarTransferPackageEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CarTransferPackageRepositoryPort {
  create(
    data: CreateCarTransferPackageInput,
  ): Promise<CarTransferPackageEntity>;
  update(
    id: string,
    patch: UpdateCarTransferPackageInput,
  ): Promise<CarTransferPackageEntity>;
  findById(id: string): Promise<CarTransferPackageEntity | null>;
  search(
    criteria: TransferPackageSearchCriteria,
  ): Promise<TransferPackageSearchResult>;
  findDropoffLocations(
    pickupLocationId: string,
    query?: string,
    limit?: number,
  ): Promise<CarLocationEntity[]>;
}

export const CarTransferPackageRepositoryPortToken = Symbol(
  'CarTransferPackageRepositoryPort',
);
