import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
    interface QueueRow {
        id: string;
        itemId: string;
        marketHashName: string;
        nextRunAt: Date;
        priority: number;
        tier: string;
        attempts: number;
        lastError: string | null;
        lockedUntil: Date | null;
        lastFetchedAt: Date | null;
        disabledReason: string | null;
        status: string;
    }

    interface ConfigRow {
        id: string;
        liveScmEnabled: boolean;
        circuitBreakerUntil: Date | null;
        consecutiveProviderFailures: number;
        requestBudget: unknown;
        lastRunAt: Date | null;
        lastError: string | null;
    }

    const rows: QueueRow[] = [];
    const config: ConfigRow = {
        id: "default",
        liveScmEnabled: true,
        circuitBreakerUntil: null,
        consecutiveProviderFailures: 0,
        requestBudget: {},
        lastRunAt: null,
        lastError: null,
    };

    function toRecord(row: QueueRow) {
        return {
            id: row.id,
            itemId: row.itemId,
            nextRunAt: row.nextRunAt,
            priority: row.priority,
            tier: row.tier,
            attempts: row.attempts,
            lastError: row.lastError,
            lockedUntil: row.lockedUntil,
            lastFetchedAt: row.lastFetchedAt,
            disabledReason: row.disabledReason,
            status: row.status,
            item: { marketHashName: row.marketHashName },
        };
    }

    function statusIn(rowStatus: string, statusFilter: unknown): boolean {
        if (typeof statusFilter === "string") return rowStatus === statusFilter;
        if (typeof statusFilter !== "object" || statusFilter === null || !("in" in statusFilter)) return true;
        const values = (statusFilter as { in: string[] }).in;
        return values.includes(rowStatus);
    }

    function tierAllowed(rowTier: string, tierFilter: unknown): boolean {
        if (typeof tierFilter !== "object" || tierFilter === null) return true;
        if ("notIn" in tierFilter) return !(tierFilter as { notIn: string[] }).notIn.includes(rowTier);
        if ("in" in tierFilter) return (tierFilter as { in: string[] }).in.includes(rowTier);
        return true;
    }

    function isDue(row: QueueRow, now: Date): boolean {
        return row.nextRunAt.getTime() <= now.getTime() && (!row.lockedUntil || row.lockedUntil.getTime() < now.getTime());
    }

    function applyData(row: QueueRow, data: Record<string, unknown>): void {
        for (const [key, value] of Object.entries(data)) {
            if (key === "attempts" && typeof value === "object" && value !== null && "increment" in value) {
                row.attempts += (value as { increment: number }).increment;
                continue;
            }
            if (key === "priority" && typeof value === "number") row.priority = value;
            if (key === "status" && typeof value === "string") row.status = value;
            if (key === "lastError" && (typeof value === "string" || value === null)) row.lastError = value;
            if (key === "disabledReason" && (typeof value === "string" || value === null)) row.disabledReason = value;
            if (key === "lockedUntil" && (value instanceof Date || value === null)) row.lockedUntil = value;
            if (key === "lastFetchedAt" && (value instanceof Date || value === null)) row.lastFetchedAt = value;
            if (key === "nextRunAt" && value instanceof Date) row.nextRunAt = value;
            if (key === "attempts" && typeof value === "number") row.attempts = value;
        }
    }

    function updateConfig(data: Record<string, unknown>): ConfigRow {
        if (typeof data.liveScmEnabled === "boolean") config.liveScmEnabled = data.liveScmEnabled;
        if (data.circuitBreakerUntil instanceof Date || data.circuitBreakerUntil === null) config.circuitBreakerUntil = data.circuitBreakerUntil;
        if (typeof data.consecutiveProviderFailures === "number") config.consecutiveProviderFailures = data.consecutiveProviderFailures;
        if (data.requestBudget !== undefined) config.requestBudget = data.requestBudget;
        if (data.lastRunAt instanceof Date || data.lastRunAt === null) config.lastRunAt = data.lastRunAt;
        if (typeof data.lastError === "string" || data.lastError === null) config.lastError = data.lastError;
        return { ...config };
    }

    return {
        rows,
        config,
        intelligenceQueueItem: {
            findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) => rows
                .filter((row) => statusIn(row.status, where.status))
                .filter((row) => tierAllowed(row.tier, where.tier))
                .filter((row) => isDue(row, (where.nextRunAt as { lte: Date }).lte))
                .sort((a, b) => b.priority - a.priority || a.nextRunAt.getTime() - b.nextRunAt.getTime())
                .slice(0, take)
                .map(toRecord)),
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                const row = rows.find((candidate) => candidate.id === where.id);
                return row ? toRecord(row) : null;
            }),
            findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
                const dueBefore = where.nextRunAt ? (where.nextRunAt as { lte: Date }).lte : new Date("9999-01-01T00:00:00.000Z");
                const row = rows
                    .filter((candidate) => statusIn(candidate.status, where.status))
                    .filter((candidate) => candidate.nextRunAt.getTime() <= dueBefore.getTime())
                    .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())[0];
                return row ? { nextRunAt: row.nextRunAt } : null;
            }),
            count: vi.fn(async ({ where }: { where: { status: string } }) => rows.filter((row) => row.status === where.status).length),
            updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const matched = rows.filter((row) => {
                    if (typeof where.id === "string" && row.id !== where.id) return false;
                    if (!statusIn(row.status, where.status)) return false;
                    if (!tierAllowed(row.tier, where.tier)) return false;
                    if (where.nextRunAt && row.nextRunAt.getTime() > (where.nextRunAt as { lte: Date }).lte.getTime()) return false;
                    if (where.lockedUntil && (!row.lockedUntil || row.lockedUntil.getTime() >= (where.lockedUntil as { lt: Date }).lt.getTime())) return false;
                    if (Array.isArray(where.OR)) {
                        const now = where.nextRunAt ? (where.nextRunAt as { lte: Date }).lte : new Date();
                        if (row.lockedUntil && row.lockedUntil.getTime() >= now.getTime()) return false;
                    }
                    return true;
                });
                matched.forEach((row) => applyData(row, data));
                return { count: matched.length };
            }),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const row = rows.find((candidate) => candidate.id === where.id);
                if (!row) throw new Error(`Missing row ${where.id}`);
                applyData(row, data);
                return toRecord(row);
            }),
        },
        intelligenceConfig: {
            findUnique: vi.fn(async () => ({ ...config })),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updateConfig(data)),
        },
    };
});

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceQueueItem: mockDb.intelligenceQueueItem,
        intelligenceConfig: mockDb.intelligenceConfig,
    },
}));

vi.mock("@/lib/market/intelligence/processor", () => ({
    processIntelligenceResult: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { processIntelligenceResult } from "@/lib/market/intelligence/processor";
import { claimQueueItem, recoverStaleLocks, releaseQueueItemRetry } from "@/lib/market/intelligence/queue";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";
import type { CsfloatPriceListEntry, IntelligenceProviderResult, ScmNormalizedPayload } from "@/lib/market/intelligence/providers";

const NOW = new Date("2026-05-15T12:00:00.000Z");

function addRow(overrides: Partial<(typeof mockDb.rows)[number]> = {}) {
    const index = mockDb.rows.length + 1;
    mockDb.rows.push({
        id: `queue-${index}`,
        itemId: `item-${index}`,
        marketHashName: `Item ${index}`,
        nextRunAt: new Date(NOW.getTime() - index * 60_000),
        priority: index,
        tier: "standard",
        attempts: 0,
        lastError: null,
        lockedUntil: null,
        lastFetchedAt: null,
        disabledReason: null,
        status: "pending",
        ...overrides,
    });
}

function successResult(): IntelligenceProviderResult<ScmNormalizedPayload> {
    return {
        ok: true,
        source: "scm",
        cacheHit: { hit: false },
        normalized: {
            marketHashName: "Item",
            lowestPriceCents: 100,
            medianPriceCents: 120,
            volume: 3,
        },
    };
}

function csfloatSuccessResult(): IntelligenceProviderResult<CsfloatPriceListEntry> {
    return {
        ok: true,
        source: "csfloat",
        cacheHit: { hit: true, fetchedAt: NOW },
        normalized: {
            marketHashName: "Item",
            quantity: 8,
            minPriceCents: 95,
        },
    };
}

function failureResult(reason: "HTTP_429" | "HTTP_403" | "HTTP_5XX" | "TIMEOUT"): IntelligenceProviderResult<ScmNormalizedPayload> {
    return {
        ok: false,
        source: "scm",
        cacheHit: { hit: false },
        failure: {
            provider: "scm",
            reason,
            message: `${reason} burst`,
            circuitBreakerOpen: true,
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.rows.length = 0;
    mockDb.config.liveScmEnabled = true;
    mockDb.config.circuitBreakerUntil = null;
    mockDb.config.consecutiveProviderFailures = 0;
    mockDb.config.requestBudget = {};
    mockDb.config.lastRunAt = null;
    mockDb.config.lastError = null;
    vi.mocked(processIntelligenceResult).mockResolvedValue({
        status: "success",
        snapshotCreated: true,
        eventCreated: true,
    });
});

describe("intelligence queue helpers", () => {
    it("claims a due queue row with updateMany CAS semantics", async () => {
        addRow({ id: "claim-me", priority: 10 });

        const due = mockDb.rows[0];
        const claimed = await claimQueueItem({ id: due.id, nextRunAt: due.nextRunAt, lockedUntil: due.lockedUntil }, { now: NOW });

        expect(claimed?.id).toBe("claim-me");
        expect(mockDb.rows[0].status).toBe("running");
        expect(mockDb.rows[0].lockedUntil?.getTime()).toBe(NOW.getTime() + 5 * 60 * 1000);
        expect(prisma.intelligenceQueueItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: "claim-me", status: { in: ["pending", "backoff"] } }),
        }));
    });

    it("recovers stale running locks", async () => {
        addRow({ id: "stale", status: "running", lockedUntil: new Date(NOW.getTime() - 1_000) });

        const recovered = await recoverStaleLocks(NOW);

        expect(recovered).toBe(1);
        expect(mockDb.rows[0].status).toBe("pending");
        expect(mockDb.rows[0].lockedUntil).toBeNull();
        expect(mockDb.rows[0].lastError).toBe("Recovered stale intelligence queue lock");
    });

    it("retries failed rows with exponential backoff metadata", async () => {
        addRow({ id: "retry", status: "running", attempts: 1, lockedUntil: new Date(NOW.getTime() + 60_000) });

        const nextRunAt = await releaseQueueItemRetry("retry", 1, "HTTP_429 burst", NOW);

        expect(mockDb.rows[0].status).toBe("backoff");
        expect(mockDb.rows[0].attempts).toBe(2);
        expect(mockDb.rows[0].lockedUntil).toBeNull();
        expect(mockDb.rows[0].lastError).toBe("HTTP_429 burst");
        expect(nextRunAt.getTime()).toBe(NOW.getTime() + 10 * 60 * 1000);
    });
});

describe("runIntelligenceQueue", () => {
    it("honors the kill switch before claiming rows or calling providers", async () => {
        addRow();
        mockDb.config.liveScmEnabled = false;
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.status).toBe("skipped");
        expect(result.reason).toBe("live_scm_disabled");
        expect(provider).not.toHaveBeenCalled();
        expect(csfloatProvider).not.toHaveBeenCalled();
        expect(prisma.intelligenceQueueItem.updateMany).not.toHaveBeenCalled();
    });

    it("enforces the per-run cap and releases successful rows", async () => {
        addRow({ id: "one", priority: 5 });
        addRow({ id: "two", priority: 4 });
        addRow({ id: "three", priority: 3 });
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 2, provider, csfloatProvider });

        expect(result.claimed).toBe(2);
        expect(result.processed).toBe(2);
        expect(result.succeeded).toBe(2);
        expect(provider).toHaveBeenCalledTimes(2);
        expect(csfloatProvider).toHaveBeenCalledTimes(2);
        expect(processIntelligenceResult).toHaveBeenCalledTimes(2);
        expect(processIntelligenceResult).toHaveBeenCalledWith(expect.objectContaining({
            itemId: "item-1",
            marketHashName: "Item 1",
            csfloatResult: expect.objectContaining({ source: "csfloat" }),
            now: NOW,
        }));
        expect(mockDb.rows.find((row) => row.id === "one")?.lastFetchedAt).toEqual(NOW);
        expect(mockDb.rows.find((row) => row.id === "three")?.lastFetchedAt).toBeNull();
    });

    it("processes a due liquid row when backlog suspension is not active", async () => {
        addRow({ id: "liquid-normal", tier: "liquid", priority: 10, nextRunAt: new Date(NOW.getTime() - 60_000) });
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.backlogSuspended).toBe(0);
        expect(result.processed).toBe(1);
        expect(provider).toHaveBeenCalledWith("Item 1", { now: NOW, skipCache: true, timeoutMs: 15_000 });
        expect(csfloatProvider).toHaveBeenCalledWith("Item 1", { now: NOW, timeoutMs: expect.any(Number) });
        expect(mockDb.rows[0].lastFetchedAt).toEqual(NOW);
        expect(mockDb.rows[0].disabledReason).toBeNull();
    });

    it("suspends high-supply backlog when the oldest due row is over 24h stale", async () => {
        addRow({ id: "liquid", tier: "liquid", nextRunAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), priority: 10 });
        addRow({ id: "standard", tier: "standard", nextRunAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), priority: 1 });
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.backlogSuspended).toBe(1);
        expect(mockDb.rows.find((row) => row.id === "liquid")?.disabledReason).toContain("backlog older than 24h");
        expect(provider).toHaveBeenCalledTimes(1);
        expect(provider).toHaveBeenCalledWith("Item 2", { now: NOW, skipCache: true, timeoutMs: 15_000 });
        expect(csfloatProvider).toHaveBeenCalledWith("Item 2", { now: NOW, timeoutMs: expect.any(Number) });
    });

    it("opens the circuit breaker after three consecutive provider bursts", async () => {
        addRow({ id: "failure-1", priority: 3 });
        addRow({ id: "failure-2", priority: 2 });
        addRow({ id: "failure-3", priority: 1 });
        const provider = vi.fn()
            .mockResolvedValueOnce(failureResult("HTTP_429"))
            .mockResolvedValueOnce(failureResult("HTTP_5XX"))
            .mockResolvedValueOnce(failureResult("TIMEOUT"));
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.circuitBreakerOpened).toBe(true);
        expect(result.failed).toBe(3);
        expect(provider).toHaveBeenCalledTimes(3);
        expect(csfloatProvider).not.toHaveBeenCalled();
        expect(processIntelligenceResult).not.toHaveBeenCalled();
        expect(mockDb.config.consecutiveProviderFailures).toBe(3);
        expect(mockDb.config.circuitBreakerUntil?.getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);
        expect(mockDb.rows.every((row) => row.status === "backoff")).toBe(true);
    });

    it("stops before provider calls when SCM minute budget is exhausted", async () => {
        addRow();
        mockDb.config.requestBudget = {
            scmMinuteStartedAt: NOW.toISOString(),
            scmMinuteCount: 19,
            scmDayStartedAt: NOW.toISOString(),
            scmDayCount: 100,
        };
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.claimed).toBe(0);
        expect(result.skippedDueToBudget).toBe(1);
        expect(provider).not.toHaveBeenCalled();
        expect(csfloatProvider).not.toHaveBeenCalled();
        expect(processIntelligenceResult).not.toHaveBeenCalled();
    });

    it("stops before claiming rows when the safe time budget is exhausted", async () => {
        addRow({ id: "too-late" });
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        vi.useFakeTimers();
        vi.setSystemTime(new Date(NOW.getTime() + 16_001));
        const result = await runIntelligenceQueue({
            now: NOW,
            perRunCap: 5,
            budgetMs: 28_000,
            startedAtMs: NOW.getTime(),
            provider,
            csfloatProvider,
        });
        vi.useRealTimers();

        expect(result.status).toBe("time_budget_exhausted");
        expect(result.reason).toBe("time_budget_exhausted");
        expect(result.timeBudgetExceeded).toBe(true);
        expect(result.claimed).toBe(0);
        expect(result.processed).toBe(0);
        expect(result.requestedLimit).toBe(5);
        expect(result.effectiveLimit).toBe(5);
        expect(provider).not.toHaveBeenCalled();
        expect(csfloatProvider).not.toHaveBeenCalled();
        expect(mockDb.rows[0].status).toBe("pending");
        expect(mockDb.rows[0].lockedUntil).toBeNull();
    });

    it("processes another row when prior work is fast and enough budget remains", async () => {
        addRow({ id: "first", priority: 2 });
        addRow({ id: "second", priority: 1 });
        const provider = vi.fn(async () => {
            vi.setSystemTime(new Date(Date.now() + 1_000));
            return successResult();
        });
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const result = await runIntelligenceQueue({
            now: NOW,
            perRunCap: 2,
            budgetMs: 28_000,
            provider,
            csfloatProvider,
        });
        vi.useRealTimers();

        expect(result.status).toBe("success");
        expect(result.timeBudgetExceeded).toBe(false);
        expect(result.claimed).toBe(2);
        expect(result.processed).toBe(2);
        expect(result.succeeded).toBe(2);
        expect(result.elapsedMs).toBe(2_000);
        expect(result.remainingMs).toBe(26_000);
        expect(provider).toHaveBeenCalledTimes(2);
        expect(csfloatProvider).toHaveBeenCalledTimes(2);
        expect(mockDb.rows.find((row) => row.id === "first")?.lockedUntil).toBeNull();
        expect(mockDb.rows.find((row) => row.id === "second")?.lockedUntil).toBeNull();
    });

    it("passes dynamic timeout budgets into SCM and CSFloat providers", async () => {
        addRow({ id: "dynamic-timeouts" });
        const provider = vi.fn(async () => {
            vi.setSystemTime(new Date(NOW.getTime() + 27_200));
            return successResult();
        });
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const result = await runIntelligenceQueue({
            now: NOW,
            perRunCap: 1,
            budgetMs: 28_000,
            provider,
            csfloatProvider,
        });
        vi.useRealTimers();

        expect(result.processed).toBe(1);
        expect(provider).toHaveBeenCalledWith("Item 1", { now: NOW, skipCache: true, timeoutMs: 15_000 });
        expect(csfloatProvider).toHaveBeenCalledWith("Item 1", { now: NOW, timeoutMs: 250 });
        expect(processIntelligenceResult).toHaveBeenCalledWith(expect.objectContaining({
            itemId: "item-1",
            csfloatResult: expect.objectContaining({ source: "csfloat" }),
        }));
    });

    it("retries the queue row without provider circuit failure when processing fails", async () => {
        addRow({ id: "processor-failure" });
        vi.mocked(processIntelligenceResult).mockResolvedValueOnce({
            status: "failed",
            reason: "Scoring persistence failed",
            snapshotCreated: false,
            eventCreated: false,
        });
        const provider = vi.fn(async () => successResult());
        const csfloatProvider = vi.fn(async () => csfloatSuccessResult());

        const result = await runIntelligenceQueue({ now: NOW, perRunCap: 5, provider, csfloatProvider });

        expect(result.status).toBe("failed");
        expect(result.failed).toBe(1);
        expect(result.succeeded).toBe(0);
        expect(mockDb.config.consecutiveProviderFailures).toBe(0);
        expect(mockDb.config.circuitBreakerUntil).toBeNull();
        expect(mockDb.rows[0].status).toBe("backoff");
        expect(mockDb.rows[0].lastError).toBe("Scoring persistence failed");
    });
});
