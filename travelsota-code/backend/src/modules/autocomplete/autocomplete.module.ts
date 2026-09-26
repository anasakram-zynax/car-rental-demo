import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { AutocompleteController } from './api/autocomplete.controller';
import { AutocompleteService } from './application/autocomplete.service';
import { GeonamesImportService } from './application/geonames-import.service';
import { AutocompleteRepoPortToken } from './application/ports/autocomplete-repo.port';
import { PrismaAutocompleteRepository } from './infrastructure/prisma-autocomplete.repository';
import { HotelsModule } from '../hotels/hotels.module';

@Module({
  imports: [HotelsModule],
  controllers: [AutocompleteController],
  providers: [
    AutocompleteService,
    GeonamesImportService,
    {
      provide: AutocompleteRepoPortToken,
      useClass: PrismaAutocompleteRepository,
    },
  ],
  exports: [AutocompleteService, GeonamesImportService],
})
export class AutocompleteModule implements OnModuleInit {
  constructor(
    @Inject(AutocompleteRepoPortToken)
    private readonly repo: PrismaAutocompleteRepository,
  ) {}

  async onModuleInit() {
    // Warm up SQLite page cache on startup (runs once, ~100ms)
    await this.repo.warmUp();
  }
}
