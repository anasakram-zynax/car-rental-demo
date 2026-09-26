import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProviderConfigService } from '../modules/settings/application/services/provider-config.service';
import { ProviderConfigSeedService } from '../modules/settings/application/services/provider-config-seed.service';
import { FlightBookingPublicService } from '../modules/flights/application/services/flight-booking-public.service';
import { FlightsProviderRegistryService } from '../modules/flights/application/services/flights-provider-registry.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const cfg = app.get(ProviderConfigService);
    const seed = app.get(ProviderConfigSeedService);
    const registry = app.get(FlightsProviderRegistryService);
    const bookingService = app.get(FlightBookingPublicService);
    await seed.ensureSeed();

    // 1) disable provider, expect fail
    await cfg.setFlightsProviderEnabled('travelport', false);
    try {
      await registry.resolveActiveProvider();
      throw new Error('Expected provider disabled error but resolved successfully');
    } catch (e: any) {
      console.log('OK: provider disabled check passed:', e?.response?.code ?? e?.message);
    }

    // 2) enable provider
    await cfg.setFlightsProviderEnabled('travelport', true);

    // 3) preview + confirm
    const preview = await bookingService.preview({
      offerId: 'QR_CPO0',
      productId: 'QRp0',
      catalogUuid: 'dummy-catalog', // replace with real from search context
      travelers: [
        {
          givenName: 'Postman',
          surname: 'Tester',
          gender: 'Male',
          birthDate: '1990-05-15',
          passengerTypeCode: 'ADT',
          phoneCountryCode: '92',
          phoneNumber: '3001234567',
          email: 'test@example.com',
        },
      ],
    } as any);

    console.log('Preview:', preview);

    const confirm = await bookingService.confirm({
      bookingId: preview.bookingId,
      offerId: 'QR_CPO0',
      productId: 'QRp0',
      catalogUuid: 'dummy-catalog',
      travelers: [
        {
          givenName: 'Postman',
          surname: 'Tester',
          gender: 'Male',
          birthDate: '1990-05-15',
          passengerTypeCode: 'ADT',
          phoneCountryCode: '92',
          phoneNumber: '3001234567',
          email: 'test@example.com',
        },
      ],
    } as any);

    console.log('Confirm:', JSON.stringify(confirm, null, 2));
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
