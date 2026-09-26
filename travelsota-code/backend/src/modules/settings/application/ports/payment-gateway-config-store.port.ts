import type {
  PaymentGateway,
  PaymentGatewayConfigRecord,
} from '../../domain/payment-gateway-config.entity';

export interface PaymentGatewayConfigStorePort {
  findAll(): Promise<PaymentGatewayConfigRecord[]>;
  findOne(gateway: PaymentGateway): Promise<PaymentGatewayConfigRecord | null>;
  upsert(record: PaymentGatewayConfigRecord): Promise<PaymentGatewayConfigRecord>;
}
