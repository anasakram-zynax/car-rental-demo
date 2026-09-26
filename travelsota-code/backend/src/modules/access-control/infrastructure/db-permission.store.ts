import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { PermissionStorePort } from '../application/ports/permission-store.port';
import type { PermissionEntity } from '../domain/permission.entity';

@Injectable()
export class DbPermissionStore implements PermissionStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PermissionEntity[]> {
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] });
    return permissions.map(this.toEntity);
  }

  async findByCodes(codes: string[]): Promise<PermissionEntity[]> {
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    return permissions.map(this.toEntity);
  }

  async upsert(data: { code: string; name: string; group: string; description?: string }): Promise<PermissionEntity> {
    const permission = await this.prisma.permission.upsert({
      where: { code: data.code },
      create: data,
      update: { name: data.name, group: data.group, description: data.description },
    });
    return this.toEntity(permission);
  }

  private toEntity(p: any): PermissionEntity {
    return { id: p.id, code: p.code, name: p.name, group: p.group, description: p.description };
  }
}
