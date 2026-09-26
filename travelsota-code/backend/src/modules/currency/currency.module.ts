import { Module } from '@nestjs/common';
import { AdminCurrencyController } from './api/admin-currency.controller';
import { PublicCurrencyController } from './api/public-currency.controller';
import { CurrencyService } from './application/services/currency.service';
import { ExchangeRateService } from './application/services/exchange-rate.service';
import { CurrencyRateSchedulerService } from './application/services/currency-rate-scheduler.service';
import { ExchangeRateApiClient } from './infrastructure/exchange-rate-api';

// Rate-refresh scheduling is owned entirely by CurrencyRateSchedulerService
// (admin-configurable interval, DB-backed lock, run history — see the
// Currencies admin page). A second, uncoordinated fixed-cron scheduler
// (ExchangeRateSchedulerService, EVERY_DAY_AT_3AM, invisible to the admin
// UI) used to also call updateAllRates() independently — removed to avoid
// two schedulers racing to update the same rates.
@Module({
  controllers: [AdminCurrencyController, PublicCurrencyController],
  providers: [
    CurrencyService,
    ExchangeRateService,
    ExchangeRateApiClient,
    CurrencyRateSchedulerService,
  ],
  exports: [CurrencyService, ExchangeRateService],
})
export class CurrencyModule {}
