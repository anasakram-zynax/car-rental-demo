import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../decorators/require-permission.decorator';
import { PermissionCheckService } from '../../application/services/permission-check.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // STAFF users: check role-based permissions (existing behavior)
    if (user.userType === 'STAFF') {
      const hasAny = await this.permissionCheck.userHasAnyPermission(user.id, requiredPermissions);
      if (!hasAny) {
        throw new ForbiddenException(
          `Missing required permission: ${requiredPermissions.join(' or ')}`,
        );
      }
      return true;
    }

    // AGENT users: check effective permissions (role + permissionOverrides)
    if (user.userType === 'AGENT') {
      const hasAny = await this.permissionCheck.agentHasAnyPermission(user.id, requiredPermissions);
      if (!hasAny) {
        throw new ForbiddenException(
          `Missing required permission: ${requiredPermissions.join(' or ')}`,
        );
      }
      return true;
    }

    // CUSTOMER users: no RBAC permissions
    throw new ForbiddenException('Insufficient permissions');
  }
}
