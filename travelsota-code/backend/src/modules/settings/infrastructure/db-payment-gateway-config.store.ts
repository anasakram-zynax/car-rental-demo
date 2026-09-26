import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { PaymentGatewayConfigStorePort } from '../application/ports/payment-gateway-config-store.port';
import type {
  PaymentGateway,
  PaymentGatewayConfigRecord,
} from '../domain/payment-gateway-config.entity';

@Injectable()
export class DbPaymentGatewayConfigStore implements PaymentGatewayConfigStorePort {
  constructor(private readonly prisma: PrismaService) {}

  // Same 30s read cache as provider configs — gateway runtime is read on
  // every checkout/payment call. Busted on upsert below.
  private readonly readCache = new Map<string, { row: PaymentGatewayConfigRecord | null; expiresAt: number }>();
  private static readonly READ_TTL_MS = 30_000;

  async findAll(): Promise<PaymentGatewayConfigRecord[]> {
    const rows = await this.prisma.paymentGatewayConfig.findMany();
    return rows.map(this.toDomain);
  }

  async findOne(gateway: PaymentGateway): Promise<PaymentGatewayConfigRecord | null> {
    const hit = this.readCache.get(gateway);
    if (hit && hit.expiresAt > Date.now()) return hit.row;
    const row = await this.prisma.paymentGatewayConfig.findUnique({
      where: { gateway },
    });
    const record = row ? this.toDomain(row) : null;
    this.readCache.set(gateway, { row: record, expiresAt: Date.now() + DbPaymentGatewayConfigStore.READ_TTL_MS });
    return record;
  }

  async upsert(record: PaymentGatewayConfigRecord): Promise<PaymentGatewayConfigRecord> {
    const row = await this.prisma.paymentGatewayConfig.upsert({
      where: { gateway: record.gateway },
      create: {
        gateway: record.gateway,
        enabled: record.enabled,
        encryptedConfig: JSON.stringify(record.config ?? {}),
      },
      update: {
        enabled: record.enabled,
        encryptedConfig: JSON.stringify(record.config ?? {}),
      },
    });
    this.readCache.delete(record.gateway);
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    gateway: string;
    enabled: boolean;
    encryptedConfig: string;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentGatewayConfigRecord {
    return {
      gateway: row.gateway as PaymentGateway,
      enabled: row.enabled,
      config: JSON.parse(row.encryptedConfig),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
