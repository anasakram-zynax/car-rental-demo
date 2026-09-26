import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PermissionStorePort } from '../ports/permission-store.port';
import type { PermissionEntity } from '../../domain/permission.entity';

export const PERMISSION_STORE = Symbol('PERMISSION_STORE');

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private cache: { data: PermissionEntity[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 300_000; // 5 minutes — permissions change rarely

  constructor(@Inject(PERMISSION_STORE) private readonly store: PermissionStorePort) {}

  async findAll(): Promise<PermissionEntity[]> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) {
      return this.cache.data;
    }
    const data = await this.store.findAll();
    this.cache = { data, expiresAt: now + this.CACHE_TTL_MS };
    return data;
  }
}
