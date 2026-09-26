import { Test, TestingModule } from '@nestjs/testing';
import { CmsPublicService } from './cms-public.service';
import { PrismaService } from '../../../../shared/database/prisma.service';

describe('CmsPublicService', () => {
  let service: CmsPublicService;
  const mockPrisma = {
    cmsPage: {
      findUnique: jest.fn(),
    },
    cmsMenu: {
      findMany: jest.fn(),
    },
    cmsFooterCategory: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsPublicService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CmsPublicService>(CmsPublicService);
    jest.clearAllMocks();
  });

  it('returns default English page when no lang specified', async () => {
    mockPrisma.cmsPage.findUnique.mockResolvedValue({
      id: 'about-id',
      slug: 'about',
      name: 'About Us',
      description: 'English description',
      content: '<p>English content</p>',
      isActive: true,
      nameTranslations: null,
      contentTranslations: null,
    });

    const page = await service.getPageBySlug('about');
    expect(page.name).toBe('About Us');
    expect(page.content).toBe('<p>English content</p>');
  });

  it('returns fallback translation when lang is ar and DB translations are empty', async () => {
    mockPrisma.cmsPage.findUnique.mockResolvedValue({
      id: 'about-id',
      slug: 'about',
      name: 'About Us',
      description: 'English description',
      content: '<p>English content</p>',
      isActive: true,
      nameTranslations: null,
      contentTranslations: null,
    });

    const page = await service.getPageBySlug('about', 'ar');
    expect(page.name).toBe('من نحن');
    expect(page.content).toContain('عن ترافلز أو تي إيه');
  });

  it('returns fallback translation when lang is fr and DB translations are empty', async () => {
    mockPrisma.cmsPage.findUnique.mockResolvedValue({
      id: 'about-id',
      slug: 'about',
      name: 'About Us',
      description: 'English description',
      content: '<p>English content</p>',
      isActive: true,
      nameTranslations: null,
      contentTranslations: null,
    });

    const page = await service.getPageBySlug('about', 'fr');
    expect(page.name).toBe('À propos de nous');
    expect(page.content).toContain('À propos de TravelsOTA');
  });

  it('prefers database translation over fallback when available', async () => {
    mockPrisma.cmsPage.findUnique.mockResolvedValue({
      id: 'about-id',
      slug: 'about',
      name: 'About Us',
      description: 'English description',
      content: '<p>English content</p>',
      isActive: true,
      nameTranslations: { fr: 'Mon titre personnalisé' },
      contentTranslations: { fr: '<p>Mon contenu personnalisé</p>' },
    });

    const page = await service.getPageBySlug('about', 'fr');
    expect(page.name).toBe('Mon titre personnalisé');
    expect(page.content).toBe('<p>Mon contenu personnalisé</p>');
  });
});

