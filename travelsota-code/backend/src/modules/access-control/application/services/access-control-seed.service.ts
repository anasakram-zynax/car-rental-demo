import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PermissionCode, PERMISSION_GROUPS } from '../../domain/enums/permission-code.enum';

// NOTE: canonical seeding is via npm run seed:rbac (src/scripts/seed-rbac.ts)
// This service is kept as a dev convenience — it does NOT auto-run on bootstrap.

@Injectable()
export class AccessControlSeedService {
  private readonly logger = new Logger(AccessControlSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedAll() {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedSuperAdmin();
  }

  async seedPermissions() {
    for (const [groupKey, group] of Object.entries(PERMISSION_GROUPS)) {
      for (const code of group.permissions) {
        const name = code
          .replace(/:/, ' ')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        await this.prisma.permission.upsert({
          where: { code },
          create: { code, name, group: groupKey, description: `${group.label}: ${name}` },
          update: { name, group: groupKey, description: `${group.label}: ${name}` },
        });
      }
    }
    this.logger.log(`Permissions seeded (${Object.values(PermissionCode).length} codes)`);
  }

  async seedRoles() {
    const allPermissions = await this.prisma.permission.findMany();

    interface RoleDef {
      name: string;
      description: string;
      priority: number;
      isProtected: boolean;
      isDefault?: boolean;
      permissionCodes: string[] | 'ALL';
    }

    const roles: RoleDef[] = [
      { name: 'super_admin', description: 'Super Administrator — full system access', priority: 1000, isProtected: true, permissionCodes: 'ALL' },
      { name: 'admin', description: 'Administrator — full admin panel access', priority: 100, isProtected: true, permissionCodes: 'ALL' },
      // NOTE: 'customer' and 'agent' are UserTypes, NOT RBAC roles.
      // RBAC roles ONLY apply to STAFF users. Do not add customer/agent here.
    ];

    for (const def of roles) {
      await this.prisma.role.upsert({
        where: { name: def.name },
        create: { name: def.name, description: def.description, isDefault: def.isDefault ?? false, isProtected: def.isProtected, priority: def.priority },
        update: { description: def.description, isDefault: def.isDefault ?? false, isProtected: def.isProtected, priority: def.priority },
      });
    }

    for (const def of roles) {
      const role = await this.prisma.role.findUnique({ where: { name: def.name } });
      if (!role) continue;

      const targetCodes = def.permissionCodes === 'ALL' ? Object.values(PermissionCode) : def.permissionCodes;
      const targetPermIds = allPermissions.filter((p) => targetCodes.includes(p.code)).map((p) => p.id);

      const existingLinks = await this.prisma.rolePermission.findMany({ where: { roleId: role.id } });
      const existingIds = new Set(existingLinks.map((l) => l.permissionId));
      const newIds = targetPermIds.filter((id) => !existingIds.has(id));

      if (newIds.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: newIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      if (def.permissionCodes !== 'ALL') {
        const toRemove = existingLinks.filter((l) => !targetPermIds.includes(l.permissionId));
        if (toRemove.length > 0) {
          await this.prisma.rolePermission.deleteMany({
            where: { roleId: role.id, permissionId: { in: toRemove.map((l) => l.permissionId) } },
          });
        }
      }
    }

    this.logger.log(`Roles seeded (${roles.length} roles)`);
  }

  async seedSuperAdmin() {
    const email = process.env.ADMIN_EMAIL ?? 'admin@travelsota.com';
    const password = process.env.ADMIN_PASSWORD ?? 'admin123';

    if (!password || password.length < 8) {
      this.logger.warn('ADMIN_PASSWORD must be at least 8 characters — skipping super admin seed');
      return;
    }

    const superAdminRole = await this.prisma.role.findUnique({ where: { name: 'super_admin' } });
    if (!superAdminRole) {
      this.logger.warn('super_admin role not found — skipping super admin seed');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await this.prisma.user.upsert({
      where: { email },
      update: { passwordHash, roleId: superAdminRole.id, status: 'ACTIVE', userType: 'STAFF' },
      create: {
        email,
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        roleId: superAdminRole.id,
        userType: 'STAFF',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    this.logger.log(`Super admin seeded: ${admin.email}`);
  }
}
