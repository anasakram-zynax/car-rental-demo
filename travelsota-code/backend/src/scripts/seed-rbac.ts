import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';
import { PermissionCode, PERMISSION_GROUPS } from '../modules/access-control/domain/enums/permission-code.enum';

interface RoleDef {
  name: string;
  description: string;
  isDefault?: boolean;
  isProtected?: boolean;
  priority?: number;
  permissionCodes: string[] | 'ALL';
}

const ROLES: RoleDef[] = [
  {
    name: 'super_admin',
    description: 'Super Administrator — full system access',
    isProtected: true,
    priority: 100,
    permissionCodes: 'ALL',
  },
  {
    name: 'admin',
    description: 'Administrator — full admin panel access',
    isProtected: true,
    priority: 80,
    permissionCodes: 'ALL',
  },
  {
    name: 'manager',
    description: 'Manager — elevated admin access',
    priority: 50,
    permissionCodes: [
      PermissionCode.REPORTS_READ,
      PermissionCode.USERS_READ,
      PermissionCode.USERS_WRITE,
      PermissionCode.BOOKINGS_READ,
      PermissionCode.BOOKINGS_WRITE,
      PermissionCode.BOOKINGS_CANCEL,
      PermissionCode.AGENTS_READ,
      PermissionCode.SETTINGS_MANAGE_CURRENCIES,
      PermissionCode.SETTINGS_UPDATE_RATES,
      PermissionCode.SETTINGS_MANAGE_SITE,
      PermissionCode.CUSTOMER_MARKUP_READ,
      PermissionCode.CUSTOMER_MARKUP_WRITE,
      PermissionCode.PROMO_CODES_READ,
      PermissionCode.PROMO_CODES_CREATE,
      PermissionCode.PROMO_CODES_UPDATE,
    ],
  },
  // Agent roles (used by AGENT userType users)
  {
    name: 'basic_agent',
    description: 'Basic Agent — search and book flights/hotels, view own bookings and profile',
    priority: 10,
    permissionCodes: [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
    ],
  },
  {
    name: 'premium_agent',
    description: 'Premium Agent — basic + reports, commission, wallet, customer management',
    priority: 30,
    permissionCodes: [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
      PermissionCode.AGENT_VIEW_REPORTS,
      PermissionCode.AGENT_VIEW_COMMISSION,
      PermissionCode.AGENT_USE_WALLET,
      PermissionCode.AGENT_VIEW_WALLET,
      PermissionCode.AGENT_TOPUP_WALLET,
      PermissionCode.AGENT_WITHDRAW_FUNDS,
      PermissionCode.AGENT_USE_CREDIT,
      PermissionCode.AGENT_MANAGE_CUSTOMERS,
    ],
  },
  {
    name: 'corporate_agent',
    description: 'Corporate Agent — premium + cancel/modify bookings, export reports, manage sub-agents, view pricing',
    priority: 50,
    permissionCodes: [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
      PermissionCode.AGENT_CANCEL_BOOKINGS,
      PermissionCode.AGENT_MODIFY_BOOKINGS,
      PermissionCode.AGENT_VIEW_REPORTS,
      PermissionCode.AGENT_EXPORT_REPORTS,
      PermissionCode.AGENT_VIEW_COMMISSION,
      PermissionCode.AGENT_USE_WALLET,
      PermissionCode.AGENT_VIEW_WALLET,
      PermissionCode.AGENT_TOPUP_WALLET,
      PermissionCode.AGENT_WITHDRAW_FUNDS,
      PermissionCode.AGENT_USE_CREDIT,
      PermissionCode.AGENT_MANAGE_CUSTOMERS,
      PermissionCode.AGENT_VIEW_PRICING,
      PermissionCode.AGENT_MANAGE_SUB_AGENTS,
    ],
  },
  {
    name: 'sub_agent',
    description: 'Sub-Agent — limited booking/view under a parent agent',
    isProtected: true,
    priority: 5,
    permissionCodes: [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
    ],
  },
];

async function seedPermissions(prisma: PrismaService) {
  let count = 0;
  for (const [groupKey, group] of Object.entries(PERMISSION_GROUPS)) {
    for (const code of group.permissions) {
      const name = code
        .replace(/:/, ' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      await prisma.permission.upsert({
        where: { code },
        create: { code, name, group: groupKey, description: `${group.label}: ${name}` },
        update: { name, group: groupKey, description: `${group.label}: ${name}` },
      });
      count++;
    }
  }
  console.log(`  ${count} permissions upserted`);
}

async function seedRoles(prisma: PrismaService, allPermCodes: string[], permIdMap: Map<string, string>) {
  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isDefault: roleDef.isDefault ?? false,
        isProtected: roleDef.isProtected ?? false,
        priority: roleDef.priority ?? 0,
      },
      update: {
        description: roleDef.description,
        isDefault: roleDef.isDefault ?? false,
        isProtected: roleDef.isProtected ?? false,
        priority: roleDef.priority ?? 0,
      },
    });

    const targetCodes = roleDef.permissionCodes === 'ALL' ? allPermCodes : roleDef.permissionCodes;
    const targetPermIds: string[] = [];
    for (const code of targetCodes) {
      const permId = permIdMap.get(code);
      if (permId) targetPermIds.push(permId);
      else console.warn(`  ⚠ Permission code "${code}" not found in database`);
    }

    const existingLinks = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    const existingIds = new Set(existingLinks.map((l) => l.permissionId));

    const newIds = targetPermIds.filter((id) => !existingIds.has(id));
    if (newIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: newIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }

    if (roleDef.permissionCodes !== 'ALL') {
      const toRemove = existingLinks.filter((l) => !targetPermIds.includes(l.permissionId));
      if (toRemove.length > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: toRemove.map((l) => l.permissionId) } },
        });
      }
    }

    console.log(`  ${roleDef.name}: ${targetPermIds.length} permissions`);
  }
}

async function seedSuperAdmin(prisma: PrismaService) {
  const email = process.env.ADMIN_EMAIL ?? 'admin@travelsota.com';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';

  if (!password || password.length < 8) {
    console.warn('  ⚠ ADMIN_PASSWORD must be at least 8 characters — skipping super admin user seed');
    return;
  }

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  if (!superAdminRole) {
    console.warn('  ⚠ super_admin role not found — was seedRoles run?');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
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

  console.log(`  Super admin user: ${admin.email} (role: super_admin)`);
}

async function main() {
  console.log('\n=== RBAC Seed ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    console.log('Seeding permissions...');
    await seedPermissions(prisma);

    const allPermissions = await prisma.permission.findMany();
    const allPermCodes = Object.values(PermissionCode);
    const permIdMap = new Map(allPermissions.map((p) => [p.code, p.id]));

    console.log('Seeding roles...');
    await seedRoles(prisma, allPermCodes, permIdMap);

    console.log('Seeding super admin user...');
    await seedSuperAdmin(prisma);

    console.log('\n=== RBAC Seed Complete ===\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
