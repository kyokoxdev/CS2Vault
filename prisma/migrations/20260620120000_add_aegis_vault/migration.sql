CREATE TABLE IF NOT EXISTS "AegisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "agentMode" TEXT,
    "reasoningDepth" TEXT,
    "openRouterModelId" TEXT,
    "deepResearch" BOOLEAN NOT NULL DEFAULT false,
    "input" TEXT NOT NULL,
    "finalResponse" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisTrace_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AegisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AegisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "risk" TEXT NOT NULL DEFAULT 'low',
    "input" TEXT NOT NULL DEFAULT '{}',
    "inputPreview" TEXT,
    "output" TEXT NOT NULL DEFAULT '{}',
    "outputPreview" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "proposedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AegisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request" TEXT NOT NULL DEFAULT '{}',
    "response" TEXT NOT NULL DEFAULT '{}',
    "expiresAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisApproval_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AegisAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AegisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'preference',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'chat',
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "contentHash" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AegisEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "model" TEXT NOT NULL DEFAULT 'gemini-embedding-2',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "vectorJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AegisEmbedding_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "AegisMemory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AegisEmbedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AegisRun_userId_createdAt_idx" ON "AegisRun"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AegisRun_id_userId_key" ON "AegisRun"("id", "userId");
CREATE INDEX IF NOT EXISTS "AegisRun_userId_status_idx" ON "AegisRun"("userId", "status");
CREATE INDEX IF NOT EXISTS "AegisRun_sessionId_idx" ON "AegisRun"("sessionId");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisTrace_runId_sequence_key" ON "AegisTrace"("runId", "sequence");
CREATE INDEX IF NOT EXISTS "AegisTrace_runId_createdAt_idx" ON "AegisTrace"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "AegisTrace_userId_createdAt_idx" ON "AegisTrace"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AegisTrace_type_idx" ON "AegisTrace"("type");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisLog_runId_sequence_key" ON "AegisLog"("runId", "sequence");
CREATE INDEX IF NOT EXISTS "AegisLog_runId_createdAt_idx" ON "AegisLog"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "AegisLog_userId_createdAt_idx" ON "AegisLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AegisLog_level_type_idx" ON "AegisLog"("level", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisAction_userId_idempotencyKey_key" ON "AegisAction"("userId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AegisAction_id_userId_key" ON "AegisAction"("id", "userId");
CREATE INDEX IF NOT EXISTS "AegisAction_runId_status_idx" ON "AegisAction"("runId", "status");
CREATE INDEX IF NOT EXISTS "AegisAction_userId_createdAt_idx" ON "AegisAction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AegisAction_tool_idx" ON "AegisAction"("tool");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisApproval_actionId_key" ON "AegisApproval"("actionId");
CREATE UNIQUE INDEX IF NOT EXISTS "AegisApproval_id_userId_key" ON "AegisApproval"("id", "userId");
CREATE INDEX IF NOT EXISTS "AegisApproval_runId_status_idx" ON "AegisApproval"("runId", "status");
CREATE INDEX IF NOT EXISTS "AegisApproval_userId_status_idx" ON "AegisApproval"("userId", "status");
CREATE INDEX IF NOT EXISTS "AegisApproval_expiresAt_idx" ON "AegisApproval"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisMemory_userId_contentHash_key" ON "AegisMemory"("userId", "contentHash");
CREATE INDEX IF NOT EXISTS "AegisMemory_userId_archivedAt_updatedAt_idx" ON "AegisMemory"("userId", "archivedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "AegisMemory_kind_idx" ON "AegisMemory"("kind");

CREATE UNIQUE INDEX IF NOT EXISTS "AegisEmbedding_memoryId_model_contentHash_key" ON "AegisEmbedding"("memoryId", "model", "contentHash");
CREATE INDEX IF NOT EXISTS "AegisEmbedding_userId_model_idx" ON "AegisEmbedding"("userId", "model");
CREATE INDEX IF NOT EXISTS "AegisEmbedding_contentHash_idx" ON "AegisEmbedding"("contentHash");
