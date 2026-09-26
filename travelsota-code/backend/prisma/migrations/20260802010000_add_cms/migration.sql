-- CreateEnum
CREATE TYPE "CmsPosition" AS ENUM ('HEADER', 'FOOTER', 'BOTH');

-- CreateEnum
CREATE TYPE "CmsLinkType" AS ENUM ('PAGE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CmsTarget" AS ENUM ('SELF', 'BLANK');

-- CreateTable
CREATE TABLE "CmsPage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "nameTranslations" JSONB,
    "contentTranslations" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT,
    "canonicalUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsMenu" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "linkType" "CmsLinkType" NOT NULL DEFAULT 'PAGE',
    "pageId" TEXT,
    "url" TEXT,
    "target" "CmsTarget" NOT NULL DEFAULT 'SELF',
    "position" "CmsPosition" NOT NULL DEFAULT 'HEADER',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsMenu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");
CREATE INDEX "CmsPage_isActive_idx" ON "CmsPage"("isActive");
CREATE INDEX "CmsMenu_position_isActive_idx" ON "CmsMenu"("position", "isActive");
CREATE INDEX "CmsMenu_parentId_idx" ON "CmsMenu"("parentId");

-- AddForeignKey
ALTER TABLE "CmsMenu" ADD CONSTRAINT "CmsMenu_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CmsMenu" ADD CONSTRAINT "CmsMenu_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CmsMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
