import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProviderConfigService } from '../modules/settings/application/services/provider-config.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const svc = app.get(ProviderConfigService);

    const initial = await svc.getFlightsProvider('travelport');
    console.log('initial.enabled=', initial.enabled);

    await svc.setFlightsProviderEnabled('travelport', false);
    const off = await svc.getFlightsProvider('travelport');
    console.log('after disable=', off.enabled);

    await svc.setFlightsProviderEnabled('travelport', true);
    const on = await svc.getFlightsProvider('travelport');
    console.log('after enable=', on.enabled);

    console.log('toggle test done');
  } finally {
    await app.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
