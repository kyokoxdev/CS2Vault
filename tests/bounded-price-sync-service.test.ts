import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        appSettings: { findUnique: vi.fn() },
        item: { findMany: vi.fn() },
        priceSnapshot: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/market/sync-lock", () => ({
    acquireSyncLock: vi.fn(),
    releaseSyncLock: vi.fn(),
    isSyncLocked: vi.fn(),
}));

vi.mock("@/lib/market/pricing", () => ({
    writePriceSnapshotsForItems: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { acquireSyncLock, isSyncLocked, releaseSyncLock } from "@/lib/market/sync-lock";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";
import { runBoundedPriceSync } from "@/lib/market/bounded-price-sync";

const mockFindSettings = vi.mocked(prisma.appSettings.findUnique);
const mockFindItems = vi.mocked(prisma.item.findMany);
const mockFindSnapshots = vi.mocked(prisma.priceSnapshot.findMany);
const mockAcquireSyncLock = vi.mocked(acquireSyncLock);
const mockReleaseSyncLock = vi.mocked(releaseSyncLock);
const mockIsSyncLocked = vi.mocked(isSyncLocked);
const mockWritePriceSnapshotsForItems = vi.mocked(writePriceSnapshotsForItems);

describe("runBoundedPriceSync", () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        mockAcquireSyncLock.mockResolvedValue(true);
        mockReleaseSyncLock.mockResolvedValue(undefined);
        mockIsSyncLocked.mockResolvedValue(false);
        mockFindSettings.mockResolvedValue({ activeMarketSource: "csfloat" } as never);
        mockFindItems.mockResolvedValue([
            { id: "item-fresh", marketHashName: "Fresh Item" },
            { id: "item-old", marketHashName: "Old Item" },
            { id: "item-missing", marketHashName: "Missing Item" },
        ] as never);
        mockFindSnapshots.mockResolvedValue([
            { itemId: "item-fresh", timestamp: new Date("2026-07-02T09:30:00.000Z") },
            { itemId: "item-old", timestamp: new Date("2026-07-02T07:00:00.000Z") },
        ] as never);
        mockWritePriceSnapshotsForItems.mockResolvedValue({
            totalCandidates: 2,
            totalRequested: 2,
            pricedCount: 2,
            provider: "csfloat",
            attemptedProvider: "csfloat",
            skippedRecent: 0,
            fallbackAvailable: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns skipped when the shared sync lock is already held", async () => {
        mockAcquireSyncLock.mockResolvedValueOnce(false);
        mockIsSyncLocked.mockResolvedValueOnce(true);

        const result = await runBoundedPriceSync({ limit: 25, minAgeMinutes: 60, budgetMs: 25_000 });

        expect(result.status).toBe("skipped");
        expect(result.reason).toBe("already_running");
        expect(mockWritePriceSnapshotsForItems).not.toHaveBeenCalled();
        expect(mockReleaseSyncLock).not.toHaveBeenCalled();
    });

    it("selects missing and oldest stale items before fresh items", async () => {
        const result = await runBoundedPriceSync({
            limit: 2,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });
        const selectedMap = mockWritePriceSnapshotsForItems.mock.calls[0][0];

        expect([...selectedMap.entries()]).toEqual([
            ["Missing Item", "item-missing"],
            ["Old Item", "item-old"],
        ]);
        expect(mockFindSnapshots).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                source: { not: "steam-intelligence" },
            }),
            distinct: ["itemId"],
        }));
        expect(mockWritePriceSnapshotsForItems).toHaveBeenCalledWith(selectedMap, expect.objectContaining({
            overrideSource: "csfloat",
            maxItems: 2,
            minAgeMinutes: 60,
            skipCandleAggregation: true,
            bulkOnly: true,
            allowFallback: false,
            fetchSteamVolume: false,
            deadlineAtMs: expect.any(Number),
            minRemainingMs: 2_500,
            maxRetries: 0,
        }));
        expect(result.status).toBe("success");
        expect(result.selected).toBe(2);
        expect(result.remainingDue).toBe(0);
        expect(mockReleaseSyncLock).toHaveBeenCalledTimes(1);
    });

    it("pins the resolved provider and passes a hard deadline to the price writer", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T10:00:00.000Z"));

        await runBoundedPriceSync({
            limit: 2,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });

        expect(mockWritePriceSnapshotsForItems).toHaveBeenCalledWith(expect.any(Map), expect.objectContaining({
            overrideSource: "csfloat",
            deadlineAtMs: new Date("2026-07-02T10:00:25.000Z").getTime(),
            minRemainingMs: 2_500,
            maxRetries: 0,
        }));
    });

    it("returns partial when more stale items remain than the effective limit", async () => {
        const result = await runBoundedPriceSync({
            limit: 1,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });

        expect(result.status).toBe("partial");
        expect(result.selected).toBe(1);
        expect(result.remainingDue).toBe(1);
    });

    it("caps Steam to one item to stay inside the 30s cron-job.org timeout", async () => {
        mockFindSettings.mockResolvedValueOnce({ activeMarketSource: "steam" } as never);

        const result = await runBoundedPriceSync({
            limit: 25,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });
        const selectedMap = mockWritePriceSnapshotsForItems.mock.calls[0][0];

        expect([...selectedMap.entries()]).toEqual([["Missing Item", "item-missing"]]);
        expect(result.effectiveLimit).toBe(1);
        expect(result.status).toBe("partial");
    });

    it("returns time_budget_exhausted instead of failing when work crosses the budget", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-02T10:00:00.000Z"));
        mockWritePriceSnapshotsForItems.mockImplementationOnce(async () => {
            vi.setSystemTime(new Date("2026-07-02T10:00:26.000Z"));
            return {
                totalCandidates: 2,
                totalRequested: 2,
                pricedCount: 2,
                provider: "csfloat",
                attemptedProvider: "csfloat",
                skippedRecent: 0,
                fallbackAvailable: false,
            };
        });

        const result = await runBoundedPriceSync({
            limit: 2,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });

        expect(result.status).toBe("time_budget_exhausted");
        expect(result.reason).toBe("time_budget_exhausted");
        expect(result.elapsedMs).toBe(26_000);
        expect(result.remainingMs).toBe(0);
    });

    it("releases the sync lock when price writing throws", async () => {
        mockWritePriceSnapshotsForItems.mockRejectedValueOnce(new Error("provider timed out"));

        const result = await runBoundedPriceSync({
            limit: 2,
            minAgeMinutes: 60,
            budgetMs: 25_000,
            now: new Date("2026-07-02T10:00:00.000Z"),
        });

        expect(result.status).toBe("failed");
        expect(result.reason).toBe("provider timed out");
        expect(mockReleaseSyncLock).toHaveBeenCalledTimes(1);
    });
});
