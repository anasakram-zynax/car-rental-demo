import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type {
  HotelStaticContentRepoPort,
  HotelStaticContentRecord,
  UpsertStaticContentInput,
} from '../../application/ports/hotel-static-content-repo.port';

@Injectable()
export class PrismaHotelStaticContentRepository implements HotelStaticContentRepoPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProvider(provider: string, providerHotelId: string, language: string = 'en'): Promise<HotelStaticContentRecord | null> {
    const row = await this.prisma.hotelContent.findUnique({
      where: { provider_providerHotelId_language: { provider, providerHotelId, language } },
    });
    return row as unknown as HotelStaticContentRecord | null;
  }

  async findAllByCanonical(canonicalHotelId: string): Promise<HotelStaticContentRecord[]> {
    const rows = await this.prisma.hotelContent.findMany({
      where: { canonicalHotelId },
    });
    return rows as unknown as HotelStaticContentRecord[];
  }

  async upsert(input: UpsertStaticContentInput): Promise<HotelStaticContentRecord> {
    const lang = input.language ?? 'en';
    const row = await this.prisma.hotelContent.upsert({
      where: {
        provider_providerHotelId_language: {
          provider: input.provider,
          providerHotelId: input.providerHotelId,
          language: lang,
        },
      },
      create: {
        provider: input.provider,
        providerHotelId: input.providerHotelId,
        canonicalHotelId: input.canonicalHotelId ?? null,
        language: lang,
        name: input.name,
        normalizedName: input.name.toLowerCase(),
        address: input.address ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        starRating: input.starRating ?? null,
        images: (input.images ?? null) as any,
        amenities: (input.amenities ?? null) as any,
        descriptions: (input.descriptions ?? null) as any,
        rawPayload: (input.rawPayload ?? null) as any,
        lastSyncedAt: new Date(),
      },
      update: {
        name: input.name,
        normalizedName: input.name.toLowerCase(),
        address: input.address ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        starRating: input.starRating ?? null,
        images: (input.images ?? null) as any,
        amenities: (input.amenities ?? null) as any,
        descriptions: (input.descriptions ?? null) as any,
        rawPayload: (input.rawPayload ?? null) as any,
        lastSyncedAt: new Date(),
      },
    });
    return row as unknown as HotelStaticContentRecord;
  }

  async deleteByProvider(provider: string): Promise<number> {
    const result = await this.prisma.hotelContent.deleteMany({ where: { provider } });
    return result.count;
  }
}
