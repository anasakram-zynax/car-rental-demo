import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { BlogAdminService } from '../application/services/blog-admin.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto';
import type { Request } from 'express';

type AuthedRequest = Request & { user?: { id?: string } };

@UserTypes('admin')
@Controller('admin/blog/posts')
export class AdminBlogPostsController {
  constructor(private readonly adminService: BlogAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.BLOGS_READ)
  @ResponseMessage('Blog posts listed.')
  async list(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listPosts({
      status: status as 'DRAFT' | 'PUBLISHED' | undefined,
      categoryId,
      q,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(PermissionCode.BLOGS_READ)
  @ResponseMessage('Blog post retrieved.')
  async get(@Param('id') id: string) {
    return this.adminService.getPost(id);
  }

  @Post()
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog post created.')
  async create(@Body() dto: CreateBlogPostDto, @Req() req: AuthedRequest) {
    return this.adminService.create(dto, req.user?.id);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog post updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.adminService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.BLOGS_WRITE)
  @ResponseMessage('Blog post deleted.')
  async remove(@Param('id') id: string) {
    return this.adminService.remove(id);
  }
}
