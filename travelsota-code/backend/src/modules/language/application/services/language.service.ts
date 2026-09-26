import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { CreateLanguageDto } from '../../api/dto/create-language.dto';
import type { UpdateLanguageDto } from '../../api/dto/update-language.dto';

@Injectable()
export class LanguageService {
  private readonly logger = new Logger(LanguageService.name);
  private activeCache: { data: any[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    return this.prisma.language.findMany({
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  async listActive() {
    const now = Date.now();
    if (this.activeCache && now < this.activeCache.expiresAt) {
      return this.activeCache.data;
    }
    const data = await this.prisma.language.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
    this.activeCache = { data, expiresAt: now + this.CACHE_TTL_MS };
    return data;
  }

  private invalidateCache() {
    this.activeCache = null;
  }

  async getById(id: string) {
    const language = await this.prisma.language.findUnique({ where: { id } });
    if (!language) throw new NotFoundException(`Language with id "${id}" not found`);
    return language;
  }

  async create(dto: CreateLanguageDto) {
    const code = dto.code.toLowerCase();

    const existing = await this.prisma.language.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Language with code "${code}" already exists`);
    }

    if (dto.isDefault) {
      await this.clearDefaultFlag();
    }

    const created = await this.prisma.language.create({
      data: {
        code,
        name: dto.name,
        direction: dto.direction,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    this.invalidateCache();
    return created;
  }

  async update(id: string, dto: UpdateLanguageDto) {
    const language = await this.getById(id);

    if (dto.code && dto.code.toLowerCase() !== language.code) {
      const dup = await this.prisma.language.findUnique({
        where: { code: dto.code.toLowerCase() },
      });
      if (dup) {
        throw new ConflictException(`Language with code "${dto.code.toLowerCase()}" already exists`);
      }
    }

    if (dto.isDefault && !language.isDefault) {
      await this.clearDefaultFlag();
    }

    const updated = await this.prisma.language.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code.toLowerCase() }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.direction !== undefined && { direction: dto.direction }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    this.invalidateCache();
    return updated;
  }

  async deactivate(id: string) {
    const language = await this.getById(id);

    if (language.isDefault) {
      throw new BadRequestException('Cannot deactivate the default language. Set another default first.');
    }

    const deactivated = await this.prisma.language.update({
      where: { id },
      data: { isActive: false },
    });
    this.invalidateCache();
    return deactivated;
  }

  async delete(id: string) {
    const language = await this.getById(id);

    if (language.isDefault) {
      throw new BadRequestException('Cannot delete the default language. Set another default first.');
    }

    const deleted = await this.prisma.language.delete({ where: { id } });
    this.invalidateCache();
    return deleted;
  }

  async setAsDefault(id: string) {
    await this.getById(id);
    await this.clearDefaultFlag();
    const updated = await this.prisma.language.update({
      where: { id },
      data: { isDefault: true },
    });
    this.invalidateCache();
    return updated;
  }

  private async clearDefaultFlag() {
    await this.prisma.language.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
}
