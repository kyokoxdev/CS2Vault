-- AlterTable: Add sync lock fields to AppSettings
ALTER TABLE "AppSettings" ADD COLUMN "syncInProgress" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "syncStartedAt" DATETIME;

-- CreateTable: BulkPriceCache
CREATE TABLE "BulkPriceCache" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
