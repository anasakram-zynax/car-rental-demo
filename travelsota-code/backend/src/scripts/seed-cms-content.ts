import 'dotenv/config';
import { PrismaService } from '../shared/database/prisma.service';
import { CmsAdminService } from '../modules/cms/application/services/cms-admin.service';

const FOOTER_CATEGORIES = [
  {
    name: 'Company',
    slug: 'company',
    sortOrder: 0,
    menus: [
      { label: 'About Us', slug: 'about-us' },
      { label: 'Contact Us', slug: 'contact-us' },
      { label: 'Careers', slug: null, url: '/', linkType: 'EXTERNAL' as const },
      { label: 'Investors', slug: null, url: '/', linkType: 'EXTERNAL' as const },
      { label: 'Affiliate Program', slug: null, url: '/', linkType: 'EXTERNAL' as const },
    ],
  },
  {
    name: 'Support',
    slug: 'support',
    sortOrder: 1,
    menus: [
      { label: 'Help Center', slug: null, url: '/', linkType: 'EXTERNAL' as const },
      { label: 'Refund Policy', slug: 'refund-policy' },
      { label: 'Terms & Conditions', slug: 'terms-and-conditions' },
      { label: 'How to Book', slug: null, url: '/', linkType: 'EXTERNAL' as const },
      { label: 'File a Claim', slug: null, url: '/', linkType: 'EXTERNAL' as const },
      { label: 'FAQs', slug: null, url: '/', linkType: 'EXTERNAL' as const },
    ],
  },
];

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const admin = new CmsAdminService(prisma);

  try {
    const pageBySlug = new Map<string, string>();
    const pages = await prisma.cmsPage.findMany();
    for (const p of pages) pageBySlug.set(p.slug, p.id);

    let catCount = 0;
    let menuCount = 0;

    for (const cat of FOOTER_CATEGORIES) {
      const existing = await prisma.cmsFooterCategory.findUnique({ where: { slug: cat.slug } });
      if (existing) {
        console.log(`category exists: ${cat.slug}`);
        await prisma.cmsFooterCategory.update({
          where: { slug: cat.slug },
          data: { sortOrder: cat.sortOrder },
        });
      } else {
        await admin.createFooterCategory({ name: cat.name, slug: cat.slug, sortOrder: cat.sortOrder });
        console.log(`category created: ${cat.slug}`);
        catCount++;
      }

      const categoryRecord = await prisma.cmsFooterCategory.findUnique({ where: { slug: cat.slug } });
      if (!categoryRecord) continue;

      let order = 0;
      for (const menu of cat.menus) {
        const existingMenu = await prisma.cmsMenu.findFirst({
          where: { label: menu.label, footerCategoryId: categoryRecord.id },
        });
        if (existingMenu) {
          console.log(`  menu exists: ${menu.label}`);
          continue;
        }

        const pageId = menu.slug ? pageBySlug.get(menu.slug) : undefined;
        await admin.createMenu({
          label: menu.label,
          linkType: pageId ? 'PAGE' : 'EXTERNAL',
          pageId,
          url: pageId ? undefined : menu.url ?? '/',
          position: 'FOOTER',
          footerCategoryId: categoryRecord.id,
          sortOrder: order++,
          isActive: true,
          target: 'SELF',
        });
        console.log(`  menu created: ${menu.label}`);
        menuCount++;
      }
    }

    console.log(`\nDone. ${catCount} new category(ies), ${menuCount} new menu(s).`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
