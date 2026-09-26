import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { FlightOfferSnapshotRepoPort } from '../../application/ports/flight-offer-snapshot-repo.port';
import type {
  FlightOfferSnapshotEntity,
  CreateFlightOfferSnapshotInput,
} from '../../domain/entities/flight-offer-snapshot.entity';

@Injectable()
export class PrismaFlightOfferSnapshotRepository
  implements FlightOfferSnapshotRepoPort
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateFlightOfferSnapshotInput,
  ): Promise<FlightOfferSnapshotEntity> {
    const created = await this.prisma.flightOfferSnapshot.create({
      data: {
        provider: data.provider,
        userId: data.userId,
        agentId: data.agentId,
        searchKey: data.searchKey,
        offerId: data.offerId,
        tripType: data.tripType,
        contentSource: data.contentSource,
        supplierContext: data.supplierContext as any,
        normalizedOffer: data.normalizedOffer as any,
        pricingSnapshot: data.pricingSnapshot as any,
        expiresAt: new Date(data.expiresAt),
      },
    });

    return this.toEntity(created);
  }

  async updateNormalizedOffer(
    id: string,
    normalizedOffer: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.flightOfferSnapshot.update({
      where: { id },
      data: { normalizedOffer: normalizedOffer as any },
    });
  }

  async findById(id: string): Promise<FlightOfferSnapshotEntity | null> {
    const row = await this.prisma.flightOfferSnapshot.findUnique({
      where: { id },
    });
    return row ? this.toEntity(row) : null;
  }

  async findBySearchKeyAndOfferId(
    searchKey: string,
    offerId: string,
  ): Promise<FlightOfferSnapshotEntity | null> {
    const row = await this.prisma.flightOfferSnapshot.findFirst({
      where: { searchKey, offerId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toEntity(row) : null;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.flightOfferSnapshot.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private toEntity(row: any): FlightOfferSnapshotEntity {
    return {
      id: row.id,
      provider: row.provider,
      userId: row.userId ?? undefined,
      agentId: row.agentId ?? undefined,
      searchKey: row.searchKey,
      offerId: row.offerId,
      tripType: row.tripType,
      contentSource: row.contentSource ?? undefined,
      supplierContext: row.supplierContext,
      normalizedOffer: row.normalizedOffer,
      pricingSnapshot: row.pricingSnapshot,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
