import { Module, forwardRef } from '@nestjs/common';
import { AdminProviderSettingsController } from './api/admin-provider-settings.controller';
import { AdminPaymentSettingsController } from './api/admin-payment-settings.controller';
import { AdminSiteSettingsController } from './api/admin-site-settings.controller';
import { PublicSiteSettingsController } from './api/public-site-settings.controller';
import {
  ProviderConfigService,
  PROVIDER_CONFIG_STORE,
  SECRETS_CRYPTO,
} from './application/services/provider-config.service';
import {
  PaymentGatewayConfigService,
  PAYMENT_GATEWAY_CONFIG_STORE,
} from './application/services/payment-gateway-config.service';
import { PaymentGatewayConfigSeedService } from './application/services/payment-gateway-config-seed.service';
import { ProviderConfigSeedService } from './application/services/provider-config-seed.service';
import { DbProviderConfigStore } from './infrastructure/db-provider-config.store';
import { DbPaymentGatewayConfigStore } from './infrastructure/db-payment-gateway-config.store';
import { AesGcmSecretsCryptoService } from './infrastructure/aes-gcm-secrets-crypto.service';
import { SiteSettingStore } from './infrastructure/site-setting.store';
import { GuestBookingGuard } from './api/guards/guest-booking.guard';
import { HttpClientModule } from '../../shared/http/http-client.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HotelsProviderRegistryModule } from '../hotels/providers/registry/hotels-provider-registry.module';

@Module({
  controllers: [
    AdminProviderSettingsController,
    AdminPaymentSettingsController,
    AdminSiteSettingsController,
    PublicSiteSettingsController,
  ],
  providers: [
    ProviderConfigService,
    ProviderConfigSeedService,
    PaymentGatewayConfigService,
    PaymentGatewayConfigSeedService,
    DbProviderConfigStore,
    DbPaymentGatewayConfigStore,
    AesGcmSecretsCryptoService,
    SiteSettingStore,
    GuestBookingGuard,
    { provide: PROVIDER_CONFIG_STORE, useExisting: DbProviderConfigStore },
    { provide: PAYMENT_GATEWAY_CONFIG_STORE, useExisting: DbPaymentGatewayConfigStore },
    { provide: SECRETS_CRYPTO, useExisting: AesGcmSecretsCryptoService },
  ],
  // HotelsProviderRegistryModule: the settings controller invalidates the
  // hotel registry cache after admin provider writes (WS3.4).
  // forwardRef: HotelsProviderRegistryModule imports SettingsModule for
  // ProviderConfigService — a direct circular module import resolves to
  // undefined at require time, so both sides must use forwardRef().
  imports: [HttpClientModule, NotificationsModule, forwardRef(() => HotelsProviderRegistryModule)],
  exports: [ProviderConfigService, PaymentGatewayConfigService, SECRETS_CRYPTO, SiteSettingStore, GuestBookingGuard],
})
export class SettingsModule {}
