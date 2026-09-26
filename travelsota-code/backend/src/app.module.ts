import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FlightsModule } from './modules/flights/flights.module';
import { CacheModule } from './shared/cache/cache.module';
import { AppConfigModule } from './shared/config/app-config.module';
import { HttpClientModule } from './shared/http/http-client.module';
import { SettingsModule } from './modules/settings/settings.module';
import { OptionalJwtAuthGuard } from './shared/auth/optional-jwt-auth.guard';
import { UserTypesGuard } from './shared/auth/user-types.guard';
import { HealthController } from './shared/health/health.controller';
import { HealthReadyController } from './shared/health/health-ready.controller';
import { HotelsModule } from './modules/hotels/hotels.module';
import { PaymentsModule } from './modules/payment/payments.module';
import { PrismaModule } from './shared/database/prisma.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AgentPanelModule } from './modules/agent-panel/agent-panel.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrencyModule } from './modules/currency/currency.module';
import { MarkupModule } from './modules/markup/markup.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { CommissionModule } from './modules/commission/commission.module';
import { AgentBookingModule } from './modules/agent-booking/agent-booking.module';
import { AdminBookingModule } from './modules/admin-booking/admin-booking.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { RefundModule } from './modules/refund/refund.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { AutocompleteModule } from './modules/autocomplete/autocomplete.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { SearchJobModule } from './modules/search-job/search-job.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EmailModule } from './modules/email/email.module';
import { PromoCodesModule } from './modules/promo-codes/promo-codes.module';
import { LocksModule } from './shared/locks/locks.module';
import { BlogModule } from './modules/blog/blog.module';
import { CmsModule } from './modules/cms/cms.module';
import { UploadModule } from './modules/upload/upload.module';
import { LanguageModule } from './modules/language/language.module';
import { DemoLeadsModule } from './modules/demo-leads/demo-leads.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';

@Module({
  imports: [
    AppConfigModule,
    HttpClientModule,
    CacheModule,
    AuthModule,
    ScheduleModule.forRoot(),
    CurrencyModule,
    MarkupModule,
    WalletModule,
    CommissionModule,
    AgentBookingModule,
    AdminBookingModule,
    InvoicesModule,
    DocumentsModule,
    RefundModule,
    BookingsModule,
    FlightsModule,
    HotelsModule,
    AccessControlModule,
    AgentPanelModule,
    SettingsModule,
    PaymentsModule,
    DashboardModule,
    PrismaModule,
    OutboxModule,
    AutocompleteModule,
    SearchJobModule,
    NotificationsModule,
    EmailModule,
    PromoCodesModule,
    LocksModule,
    BlogModule,
    CmsModule,
    UploadModule,
    LanguageModule,
    DemoLeadsModule,
    SiteSettingsModule,
  ],
  controllers: [HealthController, HealthReadyController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OptionalJwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserTypesGuard,
    },
  ],
})
export class AppModule {}
