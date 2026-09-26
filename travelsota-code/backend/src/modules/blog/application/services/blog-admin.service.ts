import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type {
  CreateBlogPostDto,
  UpdateBlogPostDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
} from '../../api/dto';
import {
  sanitizeHtmlBody,
  stripHtmlToText,
  slugify,
} from '../../../../shared/html/html-sanitizer';

const POST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

export interface BlogPostListQuery {
  status?: 'DRAFT' | 'PUBLISHED';
  categoryId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class BlogAdminService {
  private readonly logger = new Logger(BlogAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPosts(query: BlogPostListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { excerpt: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPost(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) throw new BusinessError('BLOG_POST_NOT_FOUND');
    return post;
  }

  async create(dto: CreateBlogPostDto, authorId?: string) {
    const bodyHtml = sanitizeHtmlBody(dto.bodyHtml ?? '');
    const slug = await this.resolveSlug(
      dto.slug ? slugify(dto.slug) : slugify(dto.title),
    );
    const publishedAt =
      dto.status === 'PUBLISHED'
        ? dto.scheduledAt
          ? new Date(dto.scheduledAt)
          : new Date()
        : null;

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt ? stripHtmlToText(dto.excerpt) : null,
        coverImageUrl: dto.coverImageUrl ?? null,
        bodyHtml,
        status: dto.status ?? 'DRAFT',
        publishedAt,
        isFeatured: dto.isFeatured ?? false,
        metaTitle: dto.metaTitle ? stripHtmlToText(dto.metaTitle) : null,
        metaDescription: dto.metaDescription
          ? stripHtmlToText(dto.metaDescription)
          : null,
        metaKeywords: dto.metaKeywords
          ? stripHtmlToText(dto.metaKeywords)
          : null,
        noindex: dto.noindex ?? false,
        canonicalUrl: dto.canonicalUrl ?? null,
        categoryId: dto.categoryId ?? null,
        authorId: authorId ?? null,
      },
      include: POST_INCLUDE,
    });

    this.logger.log(`Blog post created: ${slug}`);
    return post;
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('BLOG_POST_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) {
      const targetSlug = slugify(dto.slug);
      data.slug = await this.resolveSlug(targetSlug, id);
    }
    if (dto.excerpt !== undefined)
      data.excerpt = dto.excerpt ? stripHtmlToText(dto.excerpt) : null;
    if (dto.coverImageUrl !== undefined)
      data.coverImageUrl = dto.coverImageUrl ?? null;
    if (dto.bodyHtml !== undefined)
      data.bodyHtml = sanitizeHtmlBody(dto.bodyHtml);
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.metaTitle !== undefined)
      data.metaTitle = dto.metaTitle ? stripHtmlToText(dto.metaTitle) : null;
    if (dto.metaDescription !== undefined)
      data.metaDescription = dto.metaDescription
        ? stripHtmlToText(dto.metaDescription)
        : null;
    if (dto.metaKeywords !== undefined)
      data.metaKeywords = dto.metaKeywords
        ? stripHtmlToText(dto.metaKeywords)
        : null;
    if (dto.noindex !== undefined) data.noindex = dto.noindex;
    if (dto.canonicalUrl !== undefined)
      data.canonicalUrl = dto.canonicalUrl ?? null;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId ?? null;

    const effectiveStatus = dto.status ?? existing.status;
    data.status = effectiveStatus;
    if (effectiveStatus === 'PUBLISHED' && !existing.publishedAt) {
      data.publishedAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : new Date();
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data,
      include: POST_INCLUDE,
    });

    this.logger.log(`Blog post updated: ${post.slug}`);
    return post;
  }

  async remove(id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('BLOG_POST_NOT_FOUND');
    await this.prisma.blogPost.delete({ where: { id } });
    return { id };
  }

  async listCategories() {
    const categories = await this.prisma.blogCategory.findMany({
      include: { _count: { select: { posts: true } } },
      orderBy: { name: 'asc' },
    });
    return categories;
  }

  async createCategory(dto: CreateBlogCategoryDto) {
    const slug = await this.resolveCategorySlug(
      dto.slug ? slugify(dto.slug) : slugify(dto.name),
    );
    const category = await this.prisma.blogCategory.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
      },
      include: { _count: { select: { posts: true } } },
    });
    this.logger.log(`Blog category created: ${slug}`);
    return category;
  }

  async updateCategory(id: string, dto: UpdateBlogCategoryDto) {
    const existing = await this.prisma.blogCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new BusinessError('BLOG_CATEGORY_NOT_FOUND');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined)
      data.slug = await this.resolveCategorySlug(slugify(dto.slug), id);
    if (dto.description !== undefined)
      data.description = dto.description ?? null;

    return this.prisma.blogCategory.update({
      where: { id },
      data,
      include: { _count: { select: { posts: true } } },
    });
  }

  async removeCategory(id: string) {
    const existing = await this.prisma.blogCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new BusinessError('BLOG_CATEGORY_NOT_FOUND');

    const postCount = await this.prisma.blogPost.count({
      where: { categoryId: id },
    });
    if (postCount > 0) throw new BusinessError('BLOG_CATEGORY_HAS_POSTS');

    await this.prisma.blogCategory.delete({ where: { id } });
    return { id };
  }

  private async resolveSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base || 'post';
    let n = 2;
    for (;;) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  private async resolveCategorySlug(
    base: string,
    excludeId?: string,
  ): Promise<string> {
    let candidate = base || 'category';
    let n = 2;
    for (;;) {
      const existing = await this.prisma.blogCategory.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }
}
