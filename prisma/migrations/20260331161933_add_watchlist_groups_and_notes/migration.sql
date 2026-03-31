-- AlterTable
ALTER TABLE "Item" ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "MarketCapSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "totalMarketCap" REAL NOT NULL,
    "totalListings" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'youpin',
    "topItems" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TopMoversCache" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "gainers" TEXT NOT NULL,
    "losers" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'csfloat',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WatchlistGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ItemGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "ItemGroup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WatchlistGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "activeMarketSource" TEXT NOT NULL DEFAULT 'csfloat',
    "csgotraderSubProvider" TEXT NOT NULL DEFAULT 'csfloat',
    "activeAIProvider" TEXT NOT NULL DEFAULT 'gemini-pro',
    "openAiApiKey" TEXT,
    "geminiApiKey" TEXT,
    "csfloatApiKey" TEXT,
    "syncIntervalMin" INTEGER NOT NULL DEFAULT 5,
    "priceRefreshIntervalMin" INTEGER NOT NULL DEFAULT 15,
    "watchlistOnly" BOOLEAN NOT NULL DEFAULT true,
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" DATETIME
);
INSERT INTO "new_AppSettings" ("activeAIProvider", "activeMarketSource", "googleAccessToken", "googleRefreshToken", "googleTokenExpiry", "id", "syncIntervalMin", "watchlistOnly") SELECT "activeAIProvider", "activeMarketSource", "googleAccessToken", "googleRefreshToken", "googleTokenExpiry", "id", "syncIntervalMin", "watchlistOnly" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ItemGroup_itemId_idx" ON "ItemGroup"("itemId");

-- CreateIndex
CREATE INDEX "ItemGroup_groupId_idx" ON "ItemGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemGroup_itemId_groupId_key" ON "ItemGroup"("itemId", "groupId");
