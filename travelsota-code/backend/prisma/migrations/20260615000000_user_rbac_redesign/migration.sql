-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STAFF', 'CUSTOMER', 'AGENT');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- Drop UserPermissionOverride table
DROP TABLE IF EXISTS "UserPermissionOverride" CASCADE;

-- Remove old columns from Role
ALTER TABLE "Role" DROP COLUMN IF EXISTS "type";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "isSystem";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "isStaff";

-- Add new columns to Role
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

-- Add new columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userType" "UserType" NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Migrate existing isActive to status
UPDATE "User" SET "status" = 'INACTIVE' WHERE "isActive" = false;
UPDATE "User" SET "status" = 'ACTIVE' WHERE "isActive" = true;

-- Drop old isActive column
ALTER TABLE "User" DROP COLUMN IF EXISTS "isActive";

-- Add indexes
CREATE INDEX IF NOT EXISTS "User_userType_idx" ON "User"("userType");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
DROP INDEX IF EXISTS "Role_type_idx";
CREATE INDEX IF NOT EXISTS "Role_priority_idx" ON "Role"("priority");

-- Drop Permission overrides relation on Permission
ALTER TABLE "Permission" DROP COLUMN IF EXISTS "overrides" CASCADE;
