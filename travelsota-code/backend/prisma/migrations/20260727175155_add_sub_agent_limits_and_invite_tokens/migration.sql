-- AlterTable: Add sub-agent management fields to AgentProfile
ALTER TABLE "public"."AgentProfile"
  ADD COLUMN "maxSubAgents" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "maxCreditPerSub" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "inheritMarkups" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inheritCommission" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subAgentDefaultRoleId" TEXT;

-- CreateTable: AgentInviteToken for email-based sub-agent invitations
CREATE TABLE "public"."AgentInviteToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "roleId" TEXT,
  "creditLimit" DECIMAL(12,2),
  "permissionOverrides" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentInviteToken_token_key" ON "public"."AgentInviteToken"("token");
CREATE INDEX "AgentInviteToken_email_idx" ON "public"."AgentInviteToken"("email");
CREATE INDEX "AgentInviteToken_expiresAt_idx" ON "public"."AgentInviteToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."AgentInviteToken"
  ADD CONSTRAINT "AgentInviteToken_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
