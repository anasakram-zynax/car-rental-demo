import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { UserManagementService } from '../../application/services/user-management.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { PermissionCode } from '../../domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import type { UserType } from '../../domain/user.entity';

@Controller('admin/users')
@UserTypes('admin')
export class UserManagementController {
  constructor(private readonly userManagement: UserManagementService) {}

  @Get('staff')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Staff users listed.')
  async findStaff() {
    return this.userManagement.findStaff();
  }

  @Get()
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Users listed.')
  async findAll(
    @Query('userTypes') userTypes?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const types = userTypes ? userTypes.split(',').map((t) => t.trim()).filter(Boolean) as UserType[] : undefined;
    // Paged shape when paging params present; legacy array otherwise
    // (staff/customers pages migrate next).
    if (page !== undefined || limit !== undefined || search !== undefined || sortBy !== undefined) {
      const allowedSort = ['email', 'firstName', 'createdAt', 'lastLoginAt'] as const;
      return this.userManagement.findPaged({
        userTypes: types,
        search,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        sortBy: allowedSort.includes(sortBy as (typeof allowedSort)[number])
          ? (sortBy as (typeof allowedSort)[number])
          : undefined,
        sortDir: sortDir === 'asc' ? 'asc' : 'desc',
      });
    }
    return this.userManagement.findAll(types);
  }

  @Get(':id')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('User retrieved.')
  async findById(@Param('id') id: string) {
    return this.userManagement.findById(id);
  }

  @Post()
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('User created.')
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.userManagement.create(dto, req.user?.id, ip, ua);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('User updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.userManagement.update(id, dto, req.user?.id, req.user?.role, ip, ua);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PermissionCode.USERS_DELETE)
  @ResponseMessage('User deleted.')
  async delete(@Param('id') id: string, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    await this.userManagement.softDelete(id, req.user?.id, req.user?.role, ip, ua);
  }
}
