-- Presence rows are ephemeral (15 s heartbeat), so clear them instead of backfilling pubId.
DELETE FROM "Presence";

-- AlterTable
ALTER TABLE "Presence" ADD COLUMN     "peerId" TEXT,
ADD COLUMN     "pubId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Presence_pubId_key" ON "Presence"("pubId");

