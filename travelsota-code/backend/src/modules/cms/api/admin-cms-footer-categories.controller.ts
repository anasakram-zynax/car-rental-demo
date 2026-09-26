import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CmsAdminService } from '../application/services/cms-admin.service';
import { CreateCmsFooterCategoryDto, UpdateCmsFooterCategoryDto } from './dto';

@UserTypes('admin')
@Controller('admin/cms/footer-categories')
export class AdminCmsFooterCategoriesController {
  constructor(private readonly adminService: CmsAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.CMS_READ)
  @ResponseMessage('Footer categories listed.')
  async list() { return this.adminService.listFooterCategories(); }

  @Post()
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('Footer category created.')
  async create(@Body() dto: CreateCmsFooterCategoryDto) { return this.adminService.createFooterCategory(dto); }

  @Patch(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('Footer category updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateCmsFooterCategoryDto) { return this.adminService.updateFooterCategory(id, dto); }

  @Delete(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('Footer category deleted.')
  async remove(@Param('id') id: string) { return this.adminService.deleteFooterCategory(id); }
}
