import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../../generated';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type {
  CreateCmsPageDto,
  UpdateCmsPageDto,
  CreateCmsMenuDto,
  UpdateCmsMenuDto,
  SaveMenuStructureDto,
  CreateCmsFooterCategoryDto,
  UpdateCmsFooterCategoryDto,
} from '../../api/dto';
import {
  sanitizeHtmlBody,
  stripHtmlToText,
  slugify,
} from '../../../../shared/html/html-sanitizer';

export interface CmsPageListQuery {
  q?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export type CmsPosition = 'HEADER' | 'FOOTER' | 'BOTH';

function sanitizeTranslations(
  translations: Record<string, string> | undefined,
  sanitize: (v: string) => string,
): Record<string, string> | null {
  if (!translations) return null;
  const out: Record<string, string> = {};
  for (const [lang, value] of Object.entries(translations)) {
    if (typeof value === 'string' && value.trim()) out[lang] = sanitize(value);
  }
  return Object.keys(out).length > 0 ? out : null;
}

@Injectable()
export class CmsAdminService {
  private readonly logger = new Logger(CmsAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPages(query: CmsPageListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { slug: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.cmsPage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cmsPage.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPage(id: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!page) throw new BusinessError('CMS_PAGE_NOT_FOUND');
    return page;
  }

  async createPage(dto: CreateCmsPageDto) {
    const slug = await this.resolveSlug(
      dto.slug ? slugify(dto.slug) : slugify(dto.name),
    );

    const cmsPage = await this.prisma.cmsPage.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ? stripHtmlToText(dto.description) : null,
        content: sanitizeHtmlBody(dto.content ?? ''),
        nameTranslations:
          sanitizeTranslations(dto.nameTranslations, stripHtmlToText) ??
          Prisma.JsonNull,
        contentTranslations:
          sanitizeTranslations(dto.contentTranslations, sanitizeHtmlBody) ??
          Prisma.JsonNull,
        isActive: dto.isActive ?? true,
        seoTitle: dto.seoTitle ? stripHtmlToText(dto.seoTitle) : null,
        seoDescription: dto.seoDescription
          ? stripHtmlToText(dto.seoDescription)
          : null,
        seoKeywords: dto.seoKeywords ? stripHtmlToText(dto.seoKeywords) : null,
        canonicalUrl: dto.canonicalUrl ?? null,
        noindex: dto.noindex ?? false,
      },
    });

    this.logger.log(`CMS page created: ${slug}`);
    return cmsPage;
  }

  async updatePage(id: string, dto: UpdateCmsPageDto) {
    const existing = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_PAGE_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined)
      data.slug = await this.resolveSlug(slugify(dto.slug), id);
    if (dto.description !== undefined)
      data.description = dto.description
        ? stripHtmlToText(dto.description)
        : null;
    if (dto.content !== undefined) data.content = sanitizeHtmlBody(dto.content);
    if (dto.nameTranslations !== undefined)
      data.nameTranslations =
        sanitizeTranslations(dto.nameTranslations, stripHtmlToText) ??
        Prisma.JsonNull;
    if (dto.contentTranslations !== undefined)
      data.contentTranslations =
        sanitizeTranslations(dto.contentTranslations, sanitizeHtmlBody) ??
        Prisma.JsonNull;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.seoTitle !== undefined)
      data.seoTitle = dto.seoTitle ? stripHtmlToText(dto.seoTitle) : null;
    if (dto.seoDescription !== undefined)
      data.seoDescription = dto.seoDescription
        ? stripHtmlToText(dto.seoDescription)
        : null;
    if (dto.seoKeywords !== undefined)
      data.seoKeywords = dto.seoKeywords
        ? stripHtmlToText(dto.seoKeywords)
        : null;
    if (dto.canonicalUrl !== undefined)
      data.canonicalUrl = dto.canonicalUrl ?? null;
    if (dto.noindex !== undefined) data.noindex = dto.noindex;

    const cmsPage = await this.prisma.cmsPage.update({ where: { id }, data });
    this.logger.log(`CMS page updated: ${cmsPage.slug}`);
    return cmsPage;
  }

  async deletePage(id: string) {
    const existing = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_PAGE_NOT_FOUND');
    await this.prisma.cmsPage.delete({ where: { id } });
    return { id };
  }

  async listMenus() {
    return this.prisma.cmsMenu.findMany({
      include: {
        cmsPage: { select: { id: true, name: true, slug: true } },
        footerCategory: { select: { id: true, name: true } },
      },
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createMenu(dto: CreateCmsMenuDto) {
    const menu = await this.prisma.cmsMenu.create({
      data: {
        label: dto.label,
        linkType: dto.linkType ?? 'PAGE',
        pageId: dto.linkType === 'PAGE' ? (dto.pageId ?? null) : null,
        url: dto.linkType === 'EXTERNAL' ? (dto.url ?? null) : null,
        target: dto.target ?? 'SELF',
        position: dto.position ?? 'HEADER',
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        footerCategoryId: dto.footerCategoryId ?? null,
      },
      include: { cmsPage: { select: { id: true, name: true, slug: true } } },
    });
    this.logger.log(`CMS menu created: ${menu.label}`);
    return menu;
  }

  async updateMenu(id: string, dto: UpdateCmsMenuDto) {
    const existing = await this.prisma.cmsMenu.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_MENU_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.linkType !== undefined) {
      data.linkType = dto.linkType;
      if (dto.linkType === 'PAGE') {
        data.pageId = dto.pageId ?? null;
        data.url = null;
      } else {
        data.url = dto.url ?? null;
        data.pageId = null;
      }
    } else if (existing.linkType === 'PAGE') {
      if (dto.pageId !== undefined) data.pageId = dto.pageId ?? null;
    } else if (existing.linkType === 'EXTERNAL') {
      if (dto.url !== undefined) data.url = dto.url ?? null;
    }
    if (dto.target !== undefined) data.target = dto.target;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.parentId !== undefined) data.parentId = dto.parentId ?? null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.footerCategoryId !== undefined) data.footerCategoryId = dto.footerCategoryId ?? null;

    const menu = await this.prisma.cmsMenu.update({
      where: { id },
      data,
      include: { cmsPage: { select: { id: true, name: true, slug: true } } },
    });
    return menu;
  }

  async deleteMenu(id: string) {
    const existing = await this.prisma.cmsMenu.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_MENU_NOT_FOUND');
    await this.prisma.cmsMenu.delete({ where: { id } });
    return { id };
  }

  async saveMenuStructure(dto: SaveMenuStructureDto) {
    await Promise.all(
      dto.items.map((item) =>
        this.prisma.cmsMenu.update({
          where: { id: item.id },
          data: {
            position: item.position,
            parentId: item.parentId ?? null,
            sortOrder: item.sortOrder,
          },
        }),
      ),
    );
    this.logger.log(`CMS menu structure saved (${dto.items.length} items)`);
    return { updated: dto.items.length };
  }

  private async resolveSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base || 'page';
    let n = 2;
    for (;;) {
      const existing = await this.prisma.cmsPage.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  async listFooterCategories() {
    return this.prisma.cmsFooterCategory.findMany({
      include: { _count: { select: { menus: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createFooterCategory(dto: CreateCmsFooterCategoryDto) {
    const slug = await this.resolveFooterCategorySlug(dto.slug ? slugify(dto.slug) : slugify(dto.name));
    const cat = await this.prisma.cmsFooterCategory.create({
      data: { name: dto.name, slug, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
      include: { _count: { select: { menus: true } } },
    });
    this.logger.log(`Footer category created: ${slug}`);
    return cat;
  }

  async updateFooterCategory(id: string, dto: UpdateCmsFooterCategoryDto) {
    const existing = await this.prisma.cmsFooterCategory.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_MENU_NOT_FOUND');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = await this.resolveFooterCategorySlug(slugify(dto.slug), id);
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.cmsFooterCategory.update({
      where: { id }, data,
      include: { _count: { select: { menus: true } } },
    });
  }

  async deleteFooterCategory(id: string) {
    const existing = await this.prisma.cmsFooterCategory.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('CMS_MENU_NOT_FOUND');
    await this.prisma.cmsFooterCategory.delete({ where: { id } });
    return { id };
  }

  private async resolveFooterCategorySlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base || 'category';
    let n = 2;
    for (;;) {
      const existing = await this.prisma.cmsFooterCategory.findUnique({ where: { slug: candidate } });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }
}
