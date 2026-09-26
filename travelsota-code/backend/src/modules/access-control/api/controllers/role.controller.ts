import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { RoleService } from '../../application/services/role.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { PermissionCode } from '../../domain/enums/permission-code.enum';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';

@Controller('admin/roles')
@UserTypes('admin')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Roles listed.')
  async findAll() {
    return this.roleService.findAll();
  }

  @Get(':id')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Role retrieved.')
  async findById(@Param('id') id: string) {
    return this.roleService.findById(id);
  }

  @Get(':id/user-count')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Role user count retrieved.')
  async getUserCount(@Param('id') id: string) {
    const count = await this.roleService.getUserCount(id);
    return { count };
  }

  @Post()
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Role created.')
  async create(@Body() dto: CreateRoleDto, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.roleService.create(dto, req.user?.id, ip, ua);
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Role updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.roleService.update(id, dto, req.user?.id, req.user?.role, ip, ua);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Role deleted.')
  async delete(@Param('id') id: string, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    await this.roleService.delete(id, req.user?.id, req.user?.role, ip, ua);
  }
}
