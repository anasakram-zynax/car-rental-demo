import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { BlogAdminService } from '../application/services/blog-admin.service';
import { CreateBlogCategoryDto, UpdateBlogCategoryDto } from './dto';

@UserTypes('admin')
@Controller('admin/blog/categories')
export class AdminBlogCategoriesController {
  constructor(private readonly adminService: BlogAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.BLOGS_READ)
  @ResponseMessage('Blog categories listed.')
  async list() {
    return this.adminService.listCategories();
  }

  @Post()
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog category created.')
  async create(@Body() dto: CreateBlogCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog category updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateBlogCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog category deleted.')
  async remove(@Param('id') id: string) {
    return this.adminService.removeCategory(id);
  }
}
