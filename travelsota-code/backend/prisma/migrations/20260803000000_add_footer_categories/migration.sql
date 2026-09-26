-- AlterTable
ALTER TABLE "CmsMenu" ADD COLUMN "footerCategoryId" TEXT;

-- CreateTable
CREATE TABLE "CmsFooterCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsFooterCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsFooterCategory_slug_key" ON "CmsFooterCategory"("slug");
CREATE INDEX "CmsFooterCategory_sortOrder_idx" ON "CmsFooterCategory"("sortOrder");

-- AddForeignKey
ALTER TABLE "CmsMenu" ADD CONSTRAINT "CmsMenu_footerCategoryId_fkey" FOREIGN KEY ("footerCategoryId") REFERENCES "CmsFooterCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
