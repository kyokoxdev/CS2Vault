import { createClient } from "@libsql/client";

const client = createClient({ url: "file:./dev.db" });

async function main() {
    console.log("Creating missing intelligence tables...\n");

    // IntelligenceConfig
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "liveScmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "circuitBreakerUntil" DATETIME,
    "consecutiveProviderFailures" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" DATETIME,
    "lastError" TEXT,
    "requestBudget" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
    console.log("Created IntelligenceConfig");

    // IntelligenceQueueItem
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "nextRunAt" DATETIME NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedUntil" DATETIME,
    "lastFetchedAt" DATETIME,
    "disabledReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceQueueItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceQueueItem_itemId_key" ON "IntelligenceQueueItem"("itemId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_nextRunAt_idx" ON "IntelligenceQueueItem"("nextRunAt")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_tier_idx" ON "IntelligenceQueueItem"("tier")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_status_idx" ON "IntelligenceQueueItem"("status")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_itemId_idx" ON "IntelligenceQueueItem"("itemId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_status_nextRunAt_priority_idx" ON "IntelligenceQueueItem"("status", "nextRunAt", "priority")`);
    console.log("Created IntelligenceQueueItem");

    // IntelligenceProviderCache
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceProviderCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "lookupType" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "itemId" TEXT,
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    "normalizedPayload" TEXT NOT NULL DEFAULT '{}',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceProviderCache_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceProviderCache_provider_lookupType_lookupKey_key" ON "IntelligenceProviderCache"("provider", "lookupType", "lookupKey")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceProviderCache_provider_lookupType_lookupKey_idx" ON "IntelligenceProviderCache"("provider", "lookupType", "lookupKey")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceProviderCache_itemId_idx" ON "IntelligenceProviderCache"("itemId")`);
    console.log("Created IntelligenceProviderCache");

    // IntelligenceObservation
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceObservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "floorPriceCents" INTEGER,
    "medianPriceCents" INTEGER,
    "listingCount" INTEGER,
    "volume" INTEGER,
    "confidence" REAL NOT NULL DEFAULT 0,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "status" TEXT NOT NULL DEFAULT 'observed',
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceObservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceObservation_itemId_idx" ON "IntelligenceObservation"("itemId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceObservation_observedAt_idx" ON "IntelligenceObservation"("observedAt")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceObservation_status_idx" ON "IntelligenceObservation"("status")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceObservation_provider_observedAt_idx" ON "IntelligenceObservation"("provider", "observedAt")`);
    console.log("Created IntelligenceObservation");

    // IntelligenceSignal
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" REAL NOT NULL DEFAULT 0,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAt" DATETIME,
    "priceCents" INTEGER,
    "baselineCents" INTEGER,
    "deltaCents" INTEGER,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelligenceSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceSignal_itemId_signalType_status_key" ON "IntelligenceSignal"("itemId", "signalType", "status")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignal_itemId_idx" ON "IntelligenceSignal"("itemId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignal_signalType_idx" ON "IntelligenceSignal"("signalType")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignal_status_idx" ON "IntelligenceSignal"("status")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignal_detectedAt_idx" ON "IntelligenceSignal"("detectedAt")`);
    console.log("Created IntelligenceSignal");

    // IntelligenceSignalEvent
    await client.execute(`
CREATE TABLE IF NOT EXISTS "IntelligenceSignalEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "signalId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" REAL NOT NULL DEFAULT 0,
    "priceCents" INTEGER,
    "baselineCents" INTEGER,
    "deltaCents" INTEGER,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "IntelligenceSignalEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "IntelligenceSignal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_signalId_idx" ON "IntelligenceSignalEvent"("signalId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_itemId_idx" ON "IntelligenceSignalEvent"("itemId")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_signalType_idx" ON "IntelligenceSignalEvent"("signalType")`);
    await client.execute(`CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_occurredAt_idx" ON "IntelligenceSignalEvent"("occurredAt")`);
    console.log("Created IntelligenceSignalEvent");

    // Seed IntelligenceConfig singleton if not exists
    await client.execute(`INSERT OR IGNORE INTO "IntelligenceConfig" ("id", "liveScmEnabled", "consecutiveProviderFailures", "requestBudget", "updatedAt") VALUES ('default', 0, 0, '{}', CURRENT_TIMESTAMP)`);
    console.log("Seeded IntelligenceConfig default row");

    // Verify
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log("\nFinal tables:", tables.rows.map(r => r[0]));
}

main().catch(console.error).finally(() => client.close());
