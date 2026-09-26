import { Body, Controller, Get, Put } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { SiteSettingsService } from '../application/services/site-settings.service';
import { UpdateSiteSettingsDto } from './dto';

@UserTypes('admin')
@Controller('admin/site-settings')
export class AdminSiteSettingsController {
  constructor(private readonly service: SiteSettingsService) {}

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Site settings retrieved.')
  async get() {
    return this.service.getSettings();
  }

  @Put()
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_SITE)
  @ResponseMessage('Site settings updated.')
  async update(@Body() dto: UpdateSiteSettingsDto) {
    return this.service.upsertSettings(dto);
  }
}
