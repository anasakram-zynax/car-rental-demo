import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CmsAdminService } from '../application/services/cms-admin.service';
import {
  CreateCmsMenuDto,
  UpdateCmsMenuDto,
  SaveMenuStructureDto,
} from './dto';

@UserTypes('admin')
@Controller('admin/cms/menus')
export class AdminCmsMenusController {
  constructor(private readonly adminService: CmsAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.CMS_READ)
  @ResponseMessage('CMS menus listed.')
  async list() {
    return this.adminService.listMenus();
  }

  @Post()
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS menu item created.')
  async create(@Body() dto: CreateCmsMenuDto) {
    return this.adminService.createMenu(dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS menu item updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateCmsMenuDto) {
    return this.adminService.updateMenu(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS menu item deleted.')
  async remove(@Param('id') id: string) {
    return this.adminService.deleteMenu(id);
  }

  @Put('structure')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS menu structure saved.')
  async saveStructure(@Body() dto: SaveMenuStructureDto) {
    return this.adminService.saveMenuStructure(dto);
  }
}
