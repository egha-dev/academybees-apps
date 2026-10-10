-- Phase 4 S5 (G-02, ADR-036): student import jobs. Expand-only; tenant RLS via 010.
-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'COMMITTING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "import_job" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'UPLOADED',
    "file_key" VARCHAR(200),
    "file_name" VARCHAR(200) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR(8) NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '[]',
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "created_rows" INTEGER NOT NULL DEFAULT 0,
    "failure" VARCHAR(60),
    "created_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_job_tenant_id_created_at_idx" ON "import_job"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_job_expires_at_idx" ON "import_job"("expires_at");

-- AddForeignKey
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

