import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { LanguageService } from '../application/services/language.service';
import { TranslationGeneratorService } from '../application/services/translation-generator.service';
import { TranslationConfigService } from '../application/services/translation-config.service';
import { CreateLanguageDto } from './dto/create-language.dto';
import { SaveTranslationConfigDto } from './dto/save-translation-config.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';

@UserTypes('admin')
@Controller('admin/languages')
export class AdminLanguageController {
  constructor(
    private readonly languageService: LanguageService,
    private readonly translationGenerator: TranslationGeneratorService,
    private readonly translationConfig: TranslationConfigService,
  ) {}

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Languages listed.')
  async list() {
    return this.languageService.listAll();
  }

  @Post()
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Language created.')
  async create(@Body() dto: CreateLanguageDto) {
    return this.languageService.create(dto);
  }

  @Get('translate/config')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Translation provider config retrieved.')
  async getTranslateConfig() {
    return this.translationConfig.getConfig();
  }

  @Put('translate/config')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Translation provider config saved.')
  async saveTranslateConfig(@Body() dto: SaveTranslationConfigDto) {
    return this.translationConfig.saveConfig(dto);
  }

  @Post('translate/test')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Translation provider connection tested.')
  async testTranslate() {
    return this.translationGenerator.testConnection();
  }

  @Get(':id')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Language details retrieved.')
  async get(@Param('id') id: string) {
    return this.languageService.getById(id);
  }

  @Put(':id')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Language updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateLanguageDto) {
    return this.languageService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Language deleted.')
  async remove(@Param('id') id: string) {
    return this.languageService.delete(id);
  }

  @Post(':id/deactivate')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Language deactivated.')
  async deactivate(@Param('id') id: string) {
    return this.languageService.deactivate(id);
  }

  @Post(':id/activate')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Language activated.')
  async activate(@Param('id') id: string) {
    return this.languageService.update(id, { isActive: true });
  }

  @Post(':id/set-default')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Default language updated.')
  async setDefault(@Param('id') id: string) {
    return this.languageService.setAsDefault(id);
  }

  @Post(':id/generate-translations')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_LANGUAGES)
  @ResponseMessage('Translations generated.')
  async generateTranslations(
    @Param('id') id: string,
    @Body() body: { sourceContent: Record<string, unknown> },
  ) {
    const language = await this.languageService.getById(id);
    return this.translationGenerator.generateTranslations(
      language.code,
      language.name,
      { sourceContent: body.sourceContent },
    );
  }
}
