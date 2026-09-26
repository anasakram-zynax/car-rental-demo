-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'customer';

-- CreateIndex
CREATE INDEX "Role_type_idx" ON "Role"("type");
