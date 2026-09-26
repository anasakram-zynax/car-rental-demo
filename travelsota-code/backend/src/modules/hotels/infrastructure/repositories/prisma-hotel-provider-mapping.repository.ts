import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type {
  HotelSupplierLinksRepoPort,
  HotelSupplierLinksRecord,
  CreateMappingInput,
} from '../../application/ports/hotel-provider-mapping-repo.port';

@Injectable()
export class PrismaHotelSupplierLinksRepository implements HotelSupplierLinksRepoPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProvider(provider: string, providerHotelId: string): Promise<HotelSupplierLinksRecord | null> {
    const row = await this.prisma.hotelSupplierLinks.findUnique({
      where: { provider_providerHotelId: { provider, providerHotelId } },
    });
    return row as unknown as HotelSupplierLinksRecord | null;
  }

  async findByCanonical(canonicalHotelId: string): Promise<HotelSupplierLinksRecord[]> {
    const rows = await this.prisma.hotelSupplierLinks.findMany({
      where: { canonicalHotelId, status: 'active' },
    });
    return rows as unknown as HotelSupplierLinksRecord[];
  }

  async findAllByProvider(provider: string): Promise<HotelSupplierLinksRecord[]> {
    const rows = await this.prisma.hotelSupplierLinks.findMany({
      where: { provider, status: 'active' },
    });
    return rows as unknown as HotelSupplierLinksRecord[];
  }

  async findAllActive(): Promise<HotelSupplierLinksRecord[]> {
    const rows = await this.prisma.hotelSupplierLinks.findMany({
      where: { status: 'active' },
    });
    return rows as unknown as HotelSupplierLinksRecord[];
  }

  async findByProviderHotelIds(provider: string, providerHotelIds: string[]): Promise<HotelSupplierLinksRecord[]> {
    if (providerHotelIds.length === 0) return [];
    const rows = await this.prisma.hotelSupplierLinks.findMany({
      where: { provider, providerHotelId: { in: providerHotelIds.slice(0, 2000) } },
    });
    return rows as unknown as HotelSupplierLinksRecord[];
  }

  async upsert(input: CreateMappingInput): Promise<HotelSupplierLinksRecord> {
    const row = await this.prisma.hotelSupplierLinks.upsert({
      where: {
        provider_providerHotelId: {
          provider: input.provider,
          providerHotelId: input.providerHotelId,
        },
      },
      create: {
        canonicalHotelId: input.canonicalHotelId,
        provider: input.provider,
        providerHotelId: input.providerHotelId,
        matchMethod: 'imported',
        name: input.name ?? null,
        normalizedName: input.normalizedName ?? null,
        addressHash: input.addressHash ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        confidence: input.confidence ?? 0,
        status: input.status ?? 'active',
        payload: (input.payload ?? null) as any,
      },
      update: {
        canonicalHotelId: input.canonicalHotelId,
        matchMethod: 'imported',
        name: input.name ?? null,
        normalizedName: input.normalizedName ?? null,
        addressHash: input.addressHash ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        confidence: input.confidence ?? 0,
        status: input.status ?? 'active',
        payload: (input.payload ?? null) as any,
      },
    });
    return row as unknown as HotelSupplierLinksRecord;
  }
}
