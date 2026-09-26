import { Module } from '@nestjs/common';
import { AdminLanguageController } from './api/admin-language.controller';
import { PublicLanguageController } from './api/public-language.controller';
import { LanguageService } from './application/services/language.service';
import { TranslationGeneratorService } from './application/services/translation-generator.service';
import { TranslationConfigService } from './application/services/translation-config.service';

@Module({
  controllers: [AdminLanguageController, PublicLanguageController],
  providers: [
    LanguageService,
    TranslationGeneratorService,
    TranslationConfigService,
  ],
  exports: [LanguageService],
})
export class LanguageModule {}
