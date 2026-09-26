CREATE TABLE "public"."Language" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'LTR',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Language_code_key" ON "public"."Language"("code");
CREATE INDEX "Language_isActive_idx" ON "public"."Language"("isActive");
CREATE INDEX "Language_isDefault_idx" ON "public"."Language"("isDefault");
