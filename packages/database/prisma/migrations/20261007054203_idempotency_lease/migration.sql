-- AlterTable
ALTER TABLE "idempotency_record" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "committed_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_until" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Claims taken before this release had no commit marker: their outcome is unknown, so they are
-- treated as committed and never taken over (they expire as before). Review M1.
UPDATE "idempotency_record" SET "committed_at" = "created_at" WHERE "status" = 'IN_PROGRESS';
