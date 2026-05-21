import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceSignal: {
            findMany: vi.fn(),
        },
        intelligenceQueueItem: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        intelligenceConfig: {
            findUnique: vi.fn(),
        },
        intelligenceObservation: {
            findMany: vi.fn(),
        },
        intelligenceProviderCache: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("@/lib/market/intelligence/runner", () => ({
    runIntelligenceQueue: vi.fn(),
}));

vi.mock("@/lib/market/intelligence/catalog", () => ({
    seedIntelligenceCatalog: vi.fn(),
}));

vi.mock("@/lib/market/intelligence/queue", () => ({
    getQueueSummary: vi.fn(),
    promoteStaleSignalQueueItems: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";
import { seedIntelligenceCatalog } from "@/lib/market/intelligence/catalog";
import { getQueueSummary, promoteStaleSignalQueueItems } from "@/lib/market/intelligence/queue";

import { GET as getSignals } from "@/app/api/intelligence/signals/route";
import { GET as getStatus } from "@/app/api/intelligence/status/route";
import { POST as postSeed } from "@/app/api/intelligence/seed/route";
import { GET as getRun } from "@/app/api/intelligence/run/route";
import { POST as postRefresh } from "@/app/api/intelligence/refresh/route";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

const originalCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(prisma.intelligenceQueueItem.count).mockResolvedValue(0 as never);
});

afterEach(() => {
    vi.useRealTimers();
    if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET;
    } else {
        process.env.CRON_SECRET = originalCronSecret;
    }
});

describe("GET /api/intelligence/signals", () => {
    it("returns signals with items and meta, excluding raw provider payloads", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([
            {
                id: "sig-1",
                itemId: "item-1",
                signalType: "accumulation",
                status: "active",
                confidence: 78,
                detectedAt: new Date("2026-01-01T00:00:00Z"),
                lastSeenAt: new Date(),
                staleAt: null,
                priceCents: 1500,
                baselineCents: 1400,
                deltaCents: 100,
                reasons: [{ code: "accumulation-volume-spike", label: "Volume spike detected" }],
                metadata: {},
                item: { id: "item-1", marketHashName: "AK-47 | Redline", name: "AK-47 | Redline" },
            },
        ] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([
            { itemId: "item-1", tier: "liquid" },
        ] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce(null as never);

        const request = new Request("http://localhost/api/intelligence/signals");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.items).toHaveLength(1);
        expect(payload.data.items[0].id).toBe("sig-1");
        expect(payload.data.items[0].signalType).toBe("accumulation");
        expect(payload.data.items[0].confidence).toBe(78);
        expect(payload.data.items[0].reasons).toEqual([{ code: "accumulation-volume-spike", label: "Volume spike detected" }]);
        expect(payload.data.items[0].freshness).toBe("fresh");
        expect(payload.data.items[0].tier).toBe("liquid");
        expect(payload.data.items[0].marketHashName).toBe("AK-47 | Redline");
        expect(payload.data.meta).toBeDefined();
        expect(payload.data.meta.hasMore).toBe(false);
        expect(payload.data.meta.filters).toBeDefined();
    });

    it("serializes expired freshness from old lastSeenAt even when staleAt is null", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-03T12:00:00Z"));
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([
            {
                id: "sig-expired",
                itemId: "item-1",
                signalType: "accumulation",
                status: "active",
                confidence: 40,
                detectedAt: new Date("2026-01-01T00:00:00Z"),
                lastSeenAt: new Date("2026-01-01T01:00:00Z"),
                staleAt: null,
                priceCents: 1500,
                baselineCents: 1400,
                deltaCents: 100,
                reasons: [],
                metadata: {},
                item: { id: "item-1", marketHashName: "AK-47 | Redline", name: "AK-47 | Redline" },
            },
        ] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce(null as never);

        const request = new Request("http://localhost/api/intelligence/signals");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.items[0].freshness).toBe("expired");
        vi.useRealTimers();
    });

    it("includes SCM and CSFloat market detail fields from latest observation and cache", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([
            {
                id: "sig-1",
                itemId: "item-1",
                signalType: "accumulation",
                status: "active",
                confidence: 78,
                detectedAt: new Date("2026-01-01T00:00:00Z"),
                lastSeenAt: new Date(),
                staleAt: null,
                priceCents: 1500,
                baselineCents: 1400,
                deltaCents: 100,
                reasons: [],
                metadata: {},
                item: { id: "item-1", marketHashName: "AK-47 | Redline", name: "AK-47 | Redline" },
            },
        ] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([
            { itemId: "item-1", medianPriceCents: 1350, volume: 220, listingCount: 18 },
        ] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce({
            normalizedPayload: {
                entries: [
                    { marketHashName: "AK-47 | Redline", quantity: 18, minPriceCents: 1299 },
                ],
            },
        } as never);

        const request = new Request("http://localhost/api/intelligence/signals");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.items[0]).toEqual(expect.objectContaining({
            scmMedianCents: 1350,
            scmVolume: 220,
            csfloatFloorCents: 1299,
            csfloatSupply: 18,
        }));
    });

    it("filters by signalType query param", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);

        const request = new Request("http://localhost/api/intelligence/signals?signalType=pump");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.where).toHaveProperty("signalType", "pump");
    });

    it("filters by tier query param at the database level before pagination", async () => {
        vi.mocked(prisma.intelligenceQueueItem.findMany)
            .mockResolvedValueOnce([
                { itemId: "item-1", tier: "liquid" },
            ] as never)
            .mockResolvedValueOnce([
                { itemId: "item-1", tier: "liquid" },
            ] as never);
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([
            {
                id: "sig-1",
                itemId: "item-1",
                signalType: "pump",
                status: "active",
                confidence: 85,
                detectedAt: new Date("2026-01-01T00:00:00Z"),
                lastSeenAt: new Date("2026-01-01T01:00:00Z"),
                staleAt: null,
                priceCents: 2000,
                baselineCents: 1500,
                deltaCents: 500,
                reasons: [],
                metadata: {},
                item: { id: "item-1", marketHashName: "AWP | Dragon Lore", name: "AWP | Dragon Lore" },
            },
        ] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce(null as never);

        const request = new Request("http://localhost/api/intelligence/signals?tier=liquid");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.items).toHaveLength(1);
        expect(payload.data.items[0].tier).toBe("liquid");

        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.where).toHaveProperty("itemId");
        expect((findManyCall.where as Record<string, unknown>).itemId).toEqual({ in: ["item-1"] });
    });

    it("filters by freshness=fresh using lastSeenAt date range", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);

        const request = new Request("http://localhost/api/intelligence/signals?freshness=fresh");
        await getSignals(toNextRequest(request));

        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.where).toHaveProperty("lastSeenAt");
        const lastSeenAt = (findManyCall.where as Record<string, unknown>).lastSeenAt as Record<string, Date>;
        expect(lastSeenAt.gte).toBeInstanceOf(Date);
    });

    it("filters by freshness=stale using lastSeenAt date range", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);

        const request = new Request("http://localhost/api/intelligence/signals?freshness=stale");
        await getSignals(toNextRequest(request));

        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.where).toHaveProperty("lastSeenAt");
        const lastSeenAt = (findManyCall.where as Record<string, unknown>).lastSeenAt as Record<string, Date>;
        expect(lastSeenAt.gte).toBeInstanceOf(Date);
        expect(lastSeenAt.lt).toBeInstanceOf(Date);
    });

    it("filters by freshness=expired using lastSeenAt date range", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);

        const request = new Request("http://localhost/api/intelligence/signals?freshness=expired");
        await getSignals(toNextRequest(request));

        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.where).toHaveProperty("OR");
    });

    it("uses cursor-based pagination with deterministic ordering", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce(null as never);

        const request = new Request("http://localhost/api/intelligence/signals?cursor=sig-abc123");
        await getSignals(toNextRequest(request));

        const findManyCall = vi.mocked(prisma.intelligenceSignal.findMany).mock.calls[0][0];
        expect(findManyCall.cursor).toEqual({ id: "sig-abc123" });
        expect(findManyCall.skip).toBe(1);
        expect(findManyCall.orderBy).toEqual([{ detectedAt: "desc" }, { id: "desc" }]);
    });

    it("does not include raw provider payload fields", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockResolvedValueOnce([
            {
                id: "sig-1",
                itemId: "item-1",
                signalType: "accumulation",
                status: "active",
                confidence: 78,
                detectedAt: new Date("2026-01-01T00:00:00Z"),
                lastSeenAt: new Date("2026-01-01T01:00:00Z"),
                staleAt: null,
                priceCents: 1500,
                baselineCents: 1400,
                deltaCents: 100,
                reasons: [],
                metadata: {},
                item: { id: "item-1", marketHashName: "AK-47 | Redline", name: "AK-47 | Redline" },
            },
        ] as never);
        vi.mocked(prisma.intelligenceQueueItem.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceObservation.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.intelligenceProviderCache.findFirst).mockResolvedValueOnce(null as never);

        const request = new Request("http://localhost/api/intelligence/signals");
        const response = await getSignals(toNextRequest(request));
        const payload = await response.json();

        const item = payload.data.items[0];
        expect(item).not.toHaveProperty("rawPayload");
        expect(item).not.toHaveProperty("providerCache");
        expect(item).not.toHaveProperty("normalizedPayload");
    });

    it("returns 500 on database error", async () => {
        vi.mocked(prisma.intelligenceSignal.findMany).mockRejectedValueOnce(new Error("DB error"));

        const request = new Request("http://localhost/api/intelligence/signals");
        const response = await getSignals(toNextRequest(request));

        expect(response.status).toBe(500);
    });
});

describe("GET /api/intelligence/status", () => {
    it("returns queue and circuit breaker status with operational metrics when config exists", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            id: "default",
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            consecutiveProviderFailures: 0,
            lastRunAt: new Date("2026-01-01T12:00:00Z"),
            lastError: null,
            requestBudget: {},
        } as never);
        vi.mocked(getQueueSummary).mockResolvedValueOnce({
            pending: 10,
            running: 2,
            backoff: 3,
            disabled: 1,
            oldestDueAt: new Date("2026-01-01T11:00:00Z"),
            oldestDueAgeMs: 3600000,
        } as never);

        const request = new Request("http://localhost/api/intelligence/status");
        const response = await getStatus(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.initialized).toBe(true);
        expect(payload.data.killSwitch).toBe(false);
        expect(payload.data.circuitBreaker.active).toBe(false);
        expect(payload.data.queue.pending).toBe(10);
        expect(payload.data.queue.running).toBe(2);
        expect(payload.data.queue.backoff).toBe(3);
        expect(payload.data.queue.disabled).toBe(1);
        expect(payload.data.queue.oldestDueAgeMinutes).toBe(60);
        expect(payload.data.remainingDue).toBe(13);
        expect(payload.data.processed).toBeNull();
        expect(payload.data.skippedDueToBudget).toBe(0);
        expect(payload.data.lastRunAt).toBe("2026-01-01T12:00:00.000Z");
    });

    it("returns killSwitch true and remainingDue 0 when config is missing", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce(null);
        vi.mocked(getQueueSummary).mockResolvedValueOnce({
            pending: 0,
            running: 0,
            backoff: 0,
            disabled: 0,
            oldestDueAt: null,
            oldestDueAgeMs: null,
        } as never);

        const request = new Request("http://localhost/api/intelligence/status");
        const response = await getStatus(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.initialized).toBe(false);
        expect(payload.data.killSwitch).toBe(true);
        expect(payload.data.remainingDue).toBe(0);
        expect(payload.data.processed).toBeNull();
        expect(payload.data.skippedDueToBudget).toBeNull();
    });

    it("returns circuit breaker active when breaker is set", async () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            id: "default",
            liveScmEnabled: true,
            circuitBreakerUntil: futureDate,
            consecutiveProviderFailures: 3,
            lastRunAt: new Date("2026-01-01T12:00:00Z"),
            lastError: "HTTP_429",
            requestBudget: {},
        } as never);
        vi.mocked(getQueueSummary).mockResolvedValueOnce({
            pending: 5,
            running: 0,
            backoff: 10,
            disabled: 2,
            oldestDueAt: null,
            oldestDueAgeMs: null,
        } as never);

        const request = new Request("http://localhost/api/intelligence/status");
        const response = await getStatus(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.circuitBreaker.active).toBe(true);
        expect(payload.data.circuitBreaker.consecutiveFailures).toBe(3);
        expect(payload.data.remainingDue).toBe(15);
    });

    it("reports skippedDueToBudget from exhausted current SCM budget", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            id: "default",
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            consecutiveProviderFailures: 0,
            lastRunAt: new Date("2026-01-01T12:00:00Z"),
            lastError: null,
            requestBudget: {
                scmMinuteStartedAt: new Date().toISOString(),
                scmMinuteCount: 19,
                scmDayStartedAt: new Date().toISOString(),
                scmDayCount: 100,
            },
        } as never);
        vi.mocked(getQueueSummary).mockResolvedValueOnce({
            pending: 4,
            running: 0,
            backoff: 2,
            disabled: 0,
            oldestDueAt: null,
            oldestDueAgeMs: null,
        } as never);

        const request = new Request("http://localhost/api/intelligence/status");
        const response = await getStatus(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.skippedDueToBudget).toBe(6);
    });

    it("returns 500 on database error", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockRejectedValueOnce(new Error("DB error"));

        const request = new Request("http://localhost/api/intelligence/status");
        const response = await getStatus(toNextRequest(request));

        expect(response.status).toBe(500);
    });
});

describe("POST /api/intelligence/seed", () => {
    it("rejects unauthenticated requests with 401", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: null,
            error: new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        } as never);

        const request = new Request("http://localhost/api/intelligence/seed", { method: "POST" });
        const response = await postSeed(toNextRequest(request));

        expect(response.status).toBe(401);
        expect(seedIntelligenceCatalog).not.toHaveBeenCalled();
    });

    it("allows cron-authenticated requests", async () => {
        vi.mocked(seedIntelligenceCatalog).mockResolvedValueOnce({
            status: "success",
            seeded: 50,
            disabled: 5,
            skipped: 3,
            progress: { cursor: 0, nextCursor: 58, totalEntries: 1000, processedEntries: 58, cap: 1000, hasMore: true },
        } as never);

        const request = new Request("http://localhost/api/intelligence/seed", {
            method: "POST",
            headers: { authorization: "Bearer test-secret" },
            body: JSON.stringify({}),
        });
        const response = await postSeed(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.seeded).toBe(50);
        expect(payload.data.disabled).toBe(5);
        expect(payload.data.skipped).toBe(3);
        expect(seedIntelligenceCatalog).toHaveBeenCalledTimes(1);
    });

    it("allows manually-authenticated requests via requireAuth", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: { user: { steamId: "123" } },
            error: null,
        } as never);
        vi.mocked(seedIntelligenceCatalog).mockResolvedValueOnce({
            status: "success",
            seeded: 10,
            disabled: 1,
            skipped: 0,
            progress: { cursor: 0, nextCursor: null, totalEntries: 11, processedEntries: 11, cap: 1000, hasMore: false },
        } as never);

        const request = new Request("http://localhost/api/intelligence/seed", {
            method: "POST",
            body: JSON.stringify({}),
        });
        const response = await postSeed(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.seeded).toBe(10);
    });

    it("returns 500 when seeding fails", async () => {
        vi.mocked(seedIntelligenceCatalog).mockResolvedValueOnce({
            status: "failed",
            seeded: 0,
            disabled: 0,
            skipped: 0,
            progress: { cursor: 0, nextCursor: null, totalEntries: 0, processedEntries: 0, cap: 1000, hasMore: false },
            error: "CSFloat price-list unavailable",
        } as never);

        const request = new Request("http://localhost/api/intelligence/seed", {
            method: "POST",
            headers: { authorization: "Bearer test-secret" },
            body: JSON.stringify({}),
        });
        const response = await postSeed(toNextRequest(request));

        expect(response.status).toBe(500);
    });

    it("passes cursor and cap from request body", async () => {
        vi.mocked(seedIntelligenceCatalog).mockResolvedValueOnce({
            status: "success",
            seeded: 5,
            disabled: 0,
            skipped: 0,
            progress: { cursor: 100, nextCursor: 105, totalEntries: 200, processedEntries: 5, cap: 5, hasMore: true },
        } as never);

        const request = new Request("http://localhost/api/intelligence/seed", {
            method: "POST",
            headers: { authorization: "Bearer test-secret" },
            body: JSON.stringify({ cursor: 100, cap: 5 }),
        });
        const response = await postSeed(toNextRequest(request));

        expect(response.status).toBe(200);
        expect(seedIntelligenceCatalog).toHaveBeenCalledWith({ cursor: 100, cap: 5 });
    });
});

describe("POST /api/intelligence/refresh", () => {
    it("rejects unauthenticated requests with 401", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: null,
            error: new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));

        expect(response.status).toBe(401);
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns paused status without promoting or running when kill switch is enabled", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: false,
            circuitBreakerUntil: null,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
            requestBudget: {},
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("paused");
        expect(payload.data.promoted).toBe(0);
        expect(payload.data.killSwitch).toBe(true);
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns backoff status without promoting or running when circuit breaker is active", async () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000);
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: futureDate,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
            requestBudget: {},
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("backoff");
        expect(payload.data.promoted).toBe(0);
        expect(payload.data.circuitBreaker.active).toBe(true);
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns running status without promoting or running when queue rows are already running", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
            requestBudget: {},
        } as never);
        vi.mocked(prisma.intelligenceQueueItem.count).mockResolvedValueOnce(1 as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("running");
        expect(payload.data.reason).toBe("queue_items_running");
        expect(prisma.intelligenceQueueItem.count).toHaveBeenCalledWith({
            where: {
                status: "running",
                OR: [{ lockedUntil: null }, { lockedUntil: { gt: expect.any(Date) } }],
            },
        });
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("does not promote stale rows when the SCM budget is exhausted", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
            requestBudget: {
                scmMinuteStartedAt: new Date().toISOString(),
                scmMinuteCount: 19,
                scmDayStartedAt: new Date().toISOString(),
                scmDayCount: 100,
            },
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("skipped");
        expect(payload.data.reason).toBe("scm_budget_exhausted");
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("lets stale running locks fall through to runner recovery", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique)
            .mockResolvedValueOnce({
                liveScmEnabled: true,
                circuitBreakerUntil: null,
                lastRunAt: null,
                requestBudget: {},
            } as never)
            .mockResolvedValueOnce({
                circuitBreakerUntil: null,
                lastRunAt: new Date("2026-01-01T12:00:00Z"),
            } as never);
        vi.mocked(prisma.intelligenceQueueItem.count).mockResolvedValueOnce(0 as never);
        vi.mocked(promoteStaleSignalQueueItems).mockResolvedValueOnce({
            candidateSignals: 1,
            candidateQueueItems: 1,
            promoted: 1,
            itemIds: ["item-1"],
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 1,
            processed: 1,
            succeeded: 1,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 1,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            timeBudgetExceeded: false,
            budgetMs: 28_000,
            elapsedMs: 10_000,
            remainingMs: 18_000,
            requestedLimit: 1,
            effectiveLimit: 1,
            summary: { pending: 0, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));

        expect(response.status).toBe(200);
        expect(runIntelligenceQueue).toHaveBeenCalledWith(expect.objectContaining({ itemIds: ["item-1"] }));
    });

    it("promotes stale pending rows and runs only the promoted items with safe limits", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique)
            .mockResolvedValueOnce({
                liveScmEnabled: true,
                circuitBreakerUntil: null,
                lastRunAt: null,
                requestBudget: {},
            } as never)
            .mockResolvedValueOnce({
                circuitBreakerUntil: null,
                lastRunAt: new Date("2026-01-01T12:00:00Z"),
            } as never);
        vi.mocked(promoteStaleSignalQueueItems).mockResolvedValueOnce({
            candidateSignals: 2,
            candidateQueueItems: 2,
            promoted: 2,
            itemIds: ["item-1", "item-2"],
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 2,
            processed: 2,
            succeeded: 2,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            timeBudgetExceeded: false,
            budgetMs: 28_000,
            elapsedMs: 10_000,
            remainingMs: 18_000,
            requestedLimit: 2,
            effectiveLimit: 2,
            summary: { pending: 3, running: 0, backoff: 0, disabled: 1, oldestDueAt: new Date("2026-01-01T11:30:00Z"), oldestDueAgeMs: 30 * 60 * 1000 },
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("success");
        expect(payload.data.promoted).toBe(2);
        expect(payload.data.candidateSignals).toBe(2);
        expect(payload.data.candidateQueueItems).toBe(2);
        expect(payload.data.refreshedItemIds).toEqual(["item-1", "item-2"]);
        expect(payload.data.processed).toBe(2);
        expect(payload.data.remainingDue).toBe(3);
        expect(payload.data.oldestDueAgeMinutes).toBe(30);
        expect(promoteStaleSignalQueueItems).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
        expect(runIntelligenceQueue).toHaveBeenCalledWith({
            perRunCap: 2,
            budgetMs: 28_000,
            minRemainingMsToStartJob: 12_000,
            itemIds: ["item-1", "item-2"],
        });
    });

    it("does not run unrelated due backlog when no stale rows are promoted", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
            requestBudget: {},
        } as never);
        vi.mocked(promoteStaleSignalQueueItems).mockResolvedValueOnce({
            candidateSignals: 0,
            candidateQueueItems: 0,
            promoted: 0,
            itemIds: [],
        } as never);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.status).toBe("skipped");
        expect(payload.data.reason).toBe("no_stale_signal_queue_items");
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns 500 when config is missing", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce(null);

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));

        expect(response.status).toBe(500);
        expect(promoteStaleSignalQueueItems).not.toHaveBeenCalled();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns 500 on unexpected refresh errors", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockRejectedValueOnce(new Error("DB connection lost"));

        const request = new Request("http://localhost/api/intelligence/refresh", { method: "POST" });
        const response = await postRefresh(toNextRequest(request));

        expect(response.status).toBe(500);
    });
});

describe("GET /api/intelligence/run", () => {
    it("rejects unauthenticated requests with 401", async () => {
        const request = new Request("http://localhost/api/intelligence/run");
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.success).toBe(false);
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("rejects wrong CRON_SECRET with 401", async () => {
        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer wrong-secret" },
        });
        const response = await getRun(toNextRequest(request));

        expect(response.status).toBe(401);
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("accepts Authorization Bearer CRON_SECRET", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 5,
            processed: 5,
            succeeded: 5,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            summary: { pending: 10, running: 0, backoff: 3, disabled: 1, oldestDueAt: new Date("2026-01-01T13:00:00Z"), oldestDueAgeMs: 1800000 },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("success");
        expect(payload.data.processed).toBe(5);
        expect(payload.data.killSwitch).toBe(false);
        expect(payload.data.remainingDue).toBe(13);
        expect(payload.data.oldestDueAgeMinutes).toBe(30);
        expect(runIntelligenceQueue).toHaveBeenCalledTimes(1);
        expect(runIntelligenceQueue).toHaveBeenCalledWith({
            perRunCap: 10,
            budgetMs: 28_000,
            minRemainingMsToStartJob: 12_000,
        });
    });

    it("clamps run limit and budget query params to cron-safe maximums", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 10,
            processed: 10,
            succeeded: 10,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            timeBudgetExceeded: false,
            budgetMs: 28_000,
            elapsedMs: 10_000,
            remainingMs: 18_000,
            requestedLimit: 10,
            effectiveLimit: 10,
            summary: { pending: 0, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run?limit=999&budgetMs=999999", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));

        expect(response.status).toBe(200);
        expect(runIntelligenceQueue).toHaveBeenCalledWith({
            perRunCap: 10,
            budgetMs: 28_000,
            minRemainingMsToStartJob: 12_000,
        });
    });

    it("falls back to safe run defaults for invalid query params", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            timeBudgetExceeded: false,
            budgetMs: 28_000,
            elapsedMs: 0,
            remainingMs: 28_000,
            requestedLimit: 10,
            effectiveLimit: 10,
            summary: { pending: 0, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run?limit=abc&budgetMs=abc", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));

        expect(response.status).toBe(200);
        expect(runIntelligenceQueue).toHaveBeenCalledWith({
            perRunCap: 10,
            budgetMs: 28_000,
            minRemainingMsToStartJob: 12_000,
        });
    });

    it("returns time-budget runner status as successful partial data", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "time_budget_exhausted",
            reason: "time_budget_exhausted",
            claimed: 1,
            processed: 1,
            succeeded: 1,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            timeBudgetExceeded: true,
            budgetMs: 26_000,
            elapsedMs: 25_500,
            remainingMs: 500,
            requestedLimit: 10,
            effectiveLimit: 10,
            summary: { pending: 4, running: 0, backoff: 1, disabled: 0, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("time_budget_exhausted");
        expect(payload.data.reason).toBe("time_budget_exhausted");
        expect(payload.data.timeBudgetExceeded).toBe(true);
        expect(payload.data.budgetMs).toBe(26_000);
        expect(payload.data.elapsedMs).toBe(25_500);
        expect(payload.data.remainingMs).toBe(500);
        expect(payload.data.remainingDue).toBe(5);
    });

    it("accepts x-cron-secret header", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 3,
            processed: 3,
            succeeded: 3,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            summary: { pending: 5, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { "x-cron-secret": "test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(runIntelligenceQueue).toHaveBeenCalledTimes(1);
    });

    it("returns paused status when kill switch is enabled without calling runner", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: false,
            circuitBreakerUntil: null,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("paused");
        expect(payload.data.processed).toBe(0);
        expect(payload.data.skippedDueToBudget).toBe(0);
        expect(payload.data.killSwitch).toBe(true);
        expect(payload.data.nextRecommendedPingAt).toBeNull();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns backoff status when circuit breaker is active without calling runner", async () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000);
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: futureDate,
            lastRunAt: new Date("2026-01-01T10:00:00Z"),
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("backoff");
        expect(payload.data.processed).toBe(0);
        expect(payload.data.skippedDueToBudget).toBe(0);
        expect(payload.data.circuitBreaker.active).toBe(true);
        expect(payload.data.killSwitch).toBe(false);
        expect(payload.data.nextRecommendedPingAt).toBeDefined();
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns 500 when config is missing", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce(null);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));

        expect(response.status).toBe(500);
        expect(runIntelligenceQueue).not.toHaveBeenCalled();
    });

    it("returns runner result with coherent skippedDueToBudget on successful run", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "success",
            claimed: 5,
            processed: 5,
            succeeded: 5,
            failed: 0,
            skippedDueToBudget: 0,
            staleLocksRecovered: 1,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            summary: { pending: 10, running: 0, backoff: 3, disabled: 1, oldestDueAt: new Date("2026-01-01T13:00:00Z"), oldestDueAgeMs: 1800000 },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("success");
        expect(payload.data.processed).toBe(5);
        expect(payload.data.skippedDueToBudget).toBe(0);
        expect(payload.data.remainingDue).toBe(13);
        expect(payload.data.oldestDueAgeMinutes).toBe(30);
        expect(payload.data.circuitBreaker.active).toBe(false);
        expect(payload.data.killSwitch).toBe(false);
        expect(payload.data.lastRunAt).toBeDefined();
        expect(payload.data.nextRecommendedPingAt).toBeDefined();
    });

    it("returns runner skippedDueToBudget even when run has failures", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            liveScmEnabled: true,
            circuitBreakerUntil: null,
            lastRunAt: null,
        } as never);
        vi.mocked(runIntelligenceQueue).mockResolvedValueOnce({
            status: "partial",
            claimed: 5,
            processed: 5,
            succeeded: 3,
            failed: 2,
            skippedDueToBudget: 2,
            staleLocksRecovered: 0,
            backlogSuspended: 0,
            circuitBreakerOpened: false,
            summary: { pending: 8, running: 0, backoff: 2, disabled: 1, oldestDueAt: null, oldestDueAgeMs: null },
        } as never);

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.status).toBe("partial");
        expect(payload.data.processed).toBe(5);
        expect(payload.data.skippedDueToBudget).toBe(2);
        expect(payload.data.remainingDue).toBe(10);
    });

    it("returns 500 on unexpected error", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockRejectedValueOnce(new Error("DB connection lost"));

        const request = new Request("http://localhost/api/intelligence/run", {
            headers: { authorization: "Bearer test-secret" },
        });
        const response = await getRun(toNextRequest(request));

        expect(response.status).toBe(500);
    });
});
