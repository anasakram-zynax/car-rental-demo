import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './app-config.constants';
import { AppConfigService } from './app-config.service';
import { buildAppConfig } from './env.validation';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => buildAppConfig(process.env),
    },
    AppConfigService,
  ],
  exports: [APP_CONFIG, AppConfigService],
})
export class AppConfigModule {}
