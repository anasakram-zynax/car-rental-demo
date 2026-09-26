import { Module, Global, forwardRef } from '@nestjs/common';
import { HotelsProviderRegistryService } from './hotels-provider-registry.service';
import { SettingsModule } from '../../../settings/settings.module';

@Global()
@Module({
  // forwardRef: SettingsModule imports this module (WS3.4 cache invalidation),
  // and this module needs ProviderConfigService from SettingsModule. A direct
  // circular module import resolves to undefined at require time, so both
  // sides of the cycle must be wrapped in forwardRef().
  imports: [forwardRef(() => SettingsModule)],
  providers: [HotelsProviderRegistryService],
  exports: [HotelsProviderRegistryService],
})
export class HotelsProviderRegistryModule {}
