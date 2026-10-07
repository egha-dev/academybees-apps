-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "security" JSONB NOT NULL DEFAULT '{}';
