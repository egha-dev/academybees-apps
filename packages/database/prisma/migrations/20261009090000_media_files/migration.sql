-- CreateEnum
CREATE TYPE "media_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('READY', 'REMOVED');

-- CreateTable
CREATE TABLE "media_file" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "visibility" "media_visibility" NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "media_status" NOT NULL DEFAULT 'READY',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_file_storage_key_key" ON "media_file"("storage_key");

-- CreateIndex
CREATE INDEX "media_file_tenant_id_purpose_status_idx" ON "media_file"("tenant_id", "purpose", "status");

-- AddForeignKey
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

