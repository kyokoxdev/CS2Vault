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
);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceQueueItem_itemId_key" ON "IntelligenceQueueItem"("itemId");
CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_nextRunAt_idx" ON "IntelligenceQueueItem"("nextRunAt");
CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_tier_idx" ON "IntelligenceQueueItem"("tier");
CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_status_idx" ON "IntelligenceQueueItem"("status");
CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_itemId_idx" ON "IntelligenceQueueItem"("itemId");
CREATE INDEX IF NOT EXISTS "IntelligenceQueueItem_status_nextRunAt_priority_idx" ON "IntelligenceQueueItem"("status", "nextRunAt", "priority");

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceProviderCache_provider_lookupType_lookupKey_key" ON "IntelligenceProviderCache"("provider", "lookupType", "lookupKey");
CREATE INDEX IF NOT EXISTS "IntelligenceProviderCache_provider_lookupType_lookupKey_idx" ON "IntelligenceProviderCache"("provider", "lookupType", "lookupKey");
CREATE INDEX IF NOT EXISTS "IntelligenceProviderCache_itemId_idx" ON "IntelligenceProviderCache"("itemId");

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
);

CREATE INDEX IF NOT EXISTS "IntelligenceObservation_itemId_idx" ON "IntelligenceObservation"("itemId");
CREATE INDEX IF NOT EXISTS "IntelligenceObservation_observedAt_idx" ON "IntelligenceObservation"("observedAt");
CREATE INDEX IF NOT EXISTS "IntelligenceObservation_status_idx" ON "IntelligenceObservation"("status");
CREATE INDEX IF NOT EXISTS "IntelligenceObservation_provider_observedAt_idx" ON "IntelligenceObservation"("provider", "observedAt");

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntelligenceSignal_itemId_signalType_status_key" ON "IntelligenceSignal"("itemId", "signalType", "status");
CREATE INDEX IF NOT EXISTS "IntelligenceSignal_itemId_idx" ON "IntelligenceSignal"("itemId");
CREATE INDEX IF NOT EXISTS "IntelligenceSignal_signalType_idx" ON "IntelligenceSignal"("signalType");
CREATE INDEX IF NOT EXISTS "IntelligenceSignal_status_idx" ON "IntelligenceSignal"("status");
CREATE INDEX IF NOT EXISTS "IntelligenceSignal_detectedAt_idx" ON "IntelligenceSignal"("detectedAt");

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
);

CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_signalId_idx" ON "IntelligenceSignalEvent"("signalId");
CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_itemId_idx" ON "IntelligenceSignalEvent"("itemId");
CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_signalType_idx" ON "IntelligenceSignalEvent"("signalType");
CREATE INDEX IF NOT EXISTS "IntelligenceSignalEvent_occurredAt_idx" ON "IntelligenceSignalEvent"("occurredAt");

INSERT OR IGNORE INTO "IntelligenceConfig" ("id", "liveScmEnabled", "consecutiveProviderFailures", "requestBudget", "createdAt", "updatedAt")
VALUES ('default', 0, 0, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
