import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';

export interface BlogPublicListQuery {
  categorySlug?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

const PUBLIC_POST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImageUrl: true,
  publishedAt: true,
  isFeatured: true,
  viewCount: true,
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class BlogPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(query: BlogPublicListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 12));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      status: 'PUBLISHED',
      publishedAt: { lte: new Date() },
    };
    if (query.categorySlug) where.category = { slug: query.categorySlug };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { excerpt: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string>[] =
      query.sort === 'oldest'
        ? [{ publishedAt: 'asc' }]
        : query.sort === 'popular'
          ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }]
          : [{ isFeatured: 'desc' }, { publishedAt: 'desc' }];

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: PUBLIC_POST_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPublishedBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      select: {
        ...PUBLIC_POST_SELECT,
        status: true,
        bodyHtml: true,
        metaTitle: true,
        metaDescription: true,
        metaKeywords: true,
        noindex: true,
        canonicalUrl: true,
      },
    });

    if (
      !post ||
      post.status !== 'PUBLISHED' ||
      (post.publishedAt && post.publishedAt > new Date())
    ) {
      throw new BusinessError('BLOG_POST_NOT_FOUND');
    }

    this.prisma.blogPost
      .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});

    const related = await this.prisma.blogPost.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: post.id },
        ...(post.category ? { categoryId: post.category.id } : {}),
      },
      select: PUBLIC_POST_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });

    const [prevPost, nextPost] = await Promise.all([
      this.prisma.blogPost.findFirst({
        where: {
          status: 'PUBLISHED',
          id: { not: post.id },
          publishedAt: { lt: post.publishedAt ?? undefined },
        },
        select: PUBLIC_POST_SELECT,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.blogPost.findFirst({
        where: {
          status: 'PUBLISHED',
          id: { not: post.id },
          publishedAt: { gt: post.publishedAt ?? undefined },
        },
        select: PUBLIC_POST_SELECT,
        orderBy: { publishedAt: 'asc' },
      }),
    ]);

    return { ...post, related, prev: prevPost ?? null, next: nextPost ?? null };
  }

  async listCategories() {
    const now = new Date();
    const categories = await this.prisma.blogCategory.findMany({
      where: {
        posts: {
          some: {
            status: 'PUBLISHED',
            publishedAt: { lte: now },
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED',
                publishedAt: { lte: now },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return categories.map((c) => ({ ...c, postCount: c._count.posts }));
  }
}
