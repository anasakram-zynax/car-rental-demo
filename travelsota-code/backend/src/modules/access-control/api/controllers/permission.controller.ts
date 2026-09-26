import { Controller, Get } from '@nestjs/common';
import { PermissionService } from '../../application/services/permission.service';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { PermissionCode, PERMISSION_GROUPS } from '../../domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';

@Controller('admin/permissions')
@UserTypes('admin')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Permissions listed.')
  async findAll() {
    const permissions = await this.permissionService.findAll();
    const groups = Object.entries(PERMISSION_GROUPS).map(([key, group]) => ({
      key,
      label: group.label,
      permissions: group.permissions.map((code) => {
        const found = permissions.find((p) => p.code === code);
        return found ?? { code, name: code, group: key, description: null };
      }),
    }));
    return groups;
  }
}
