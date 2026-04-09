-- CreateTable: RateLimitState
-- Stores per-queue last-request timestamps for cross-isolate rate limiting.
CREATE TABLE "RateLimitState" (
    "queueName" TEXT NOT NULL PRIMARY KEY,
    "lastRequestMs" REAL NOT NULL DEFAULT 0
);
