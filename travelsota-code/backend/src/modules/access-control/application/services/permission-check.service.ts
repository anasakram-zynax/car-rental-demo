import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';

@Injectable()
export class PermissionCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        agentProfile: { select: { permissionOverrides: true } },
      },
    });

    if (!user) return [];

    // STAFF: role-based permissions only
    if (user.userType === 'STAFF' && user.role) {
      return user.role.permissions.map((rp) => rp.permission.code);
    }

    // AGENT: role-based permissions + overrides
    if (user.userType === 'AGENT') {
      const rolePerms = user.role
        ? user.role.permissions.map((rp) => rp.permission.code)
        : [];

      const overrides = user.agentProfile?.permissionOverrides as
        | { grant?: string[]; revoke?: string[] }
        | undefined;

      if (!overrides) return rolePerms;

      const granted = new Set(rolePerms);

      // Add granted overrides
      if (overrides.grant) {
        for (const code of overrides.grant) granted.add(code);
      }

      // Remove revoked overrides
      if (overrides.revoke) {
        for (const code of overrides.revoke) granted.delete(code);
      }

      return [...granted];
    }

    return [];
  }

  async userHasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    return perms.includes(permissionCode);
  }

  async userHasAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    return permissionCodes.some((code) => perms.includes(code));
  }

  async agentHasAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
    const perms = await this.getEffectivePermissions(userId);
    return permissionCodes.some((code) => perms.includes(code));
  }
}
