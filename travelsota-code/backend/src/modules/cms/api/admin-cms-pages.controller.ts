import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CmsAdminService } from '../application/services/cms-admin.service';
import { CreateCmsPageDto, UpdateCmsPageDto } from './dto';

@UserTypes('admin')
@Controller('admin/cms/pages')
export class AdminCmsPagesController {
  constructor(private readonly adminService: CmsAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.CMS_READ)
  @ResponseMessage('CMS pages listed.')
  async list(
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listPages({
      q,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(PermissionCode.CMS_READ)
  @ResponseMessage('CMS page retrieved.')
  async get(@Param('id') id: string) {
    return this.adminService.getPage(id);
  }

  @Post()
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS page created.')
  async create(@Body() dto: CreateCmsPageDto) {
    return this.adminService.createPage(dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS page updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateCmsPageDto) {
    return this.adminService.updatePage(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.CMS_WRITE)
  @ResponseMessage('CMS page deleted.')
  async remove(@Param('id') id: string) {
    return this.adminService.deletePage(id);
  }
}
