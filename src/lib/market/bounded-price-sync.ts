import { prisma } from "@/lib/db";
import { isSyncLocked, releaseSyncLock, acquireSyncLock } from "@/lib/market/sync-lock";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";
import { resolveMarketSource } from "@/lib/market/source";
import type { MarketSource } from "@/types";

export type BoundedPriceSyncStatus = "success" | "partial" | "time_budget_exhausted" | "skipped" | "failed";

export interface BoundedPriceSyncOptions {
    limit: number;
    minAgeMinutes: number;
    budgetMs: number;
    now?: Date;
}

export interface BoundedPriceSyncResult {
    status: BoundedPriceSyncStatus;
    reason?: string;
    selected: number;
    processed: number;
    pricedCount: number;
    skippedRecent: number;
    remainingDue: number;
    provider?: MarketSource;
    attemptedProvider?: MarketSource;
    requestedLimit: number;
    effectiveLimit: number;
    budgetMs: number;
    elapsedMs: number;
    remainingMs: number;
    nextRecommendedPingAt: string;
}

interface ActiveItem {
    id: string;
    marketHashName: string;
}

interface LatestSnapshot {
    itemId: string;
    timestamp: Date;
}

const STEAM_SAFE_LIMIT = 1;
const NEXT_PING_MINUTES = 10;
const RESPONSE_HEADROOM_MS = 2_500;

function buildTiming(startTime: number, budgetMs: number): { elapsedMs: number; remainingMs: number } {
    const elapsedMs = Date.now() - startTime;
    return {
        elapsedMs,
        remainingMs: Math.max(0, budgetMs - elapsedMs),
    };
}

function nextPingIso(now: Date): string {
    return new Date(now.getTime() + NEXT_PING_MINUTES * 60_000).toISOString();
}

function sortOldestFirst(
    left: { latestAt: Date | null; item: ActiveItem },
    right: { latestAt: Date | null; item: ActiveItem }
): number {
    if (left.latestAt === null && right.latestAt !== null) return -1;
    if (left.latestAt !== null && right.latestAt === null) return 1;
    if (left.latestAt === null && right.latestAt === null) {
        return left.item.marketHashName.localeCompare(right.item.marketHashName);
    }

    const timeDiff = left.latestAt!.getTime() - right.latestAt!.getTime();
    if (timeDiff !== 0) return timeDiff;
    return left.item.marketHashName.localeCompare(right.item.marketHashName);
}

export async function runBoundedPriceSync(options: BoundedPriceSyncOptions): Promise<BoundedPriceSyncResult> {
    const startTime = Date.now();
    const now = options.now ?? new Date();
    const nextRecommendedPingAt = nextPingIso(now);
    const requestedLimit = options.limit;

    const acquired = await acquireSyncLock();
    if (!acquired) {
        const { elapsedMs, remainingMs } = buildTiming(startTime, options.budgetMs);
        const locked = await isSyncLocked();
        return {
            status: "skipped",
            reason: locked ? "already_running" : "lock_unavailable",
            selected: 0,
            processed: 0,
            pricedCount: 0,
            skippedRecent: 0,
            remainingDue: 0,
            requestedLimit,
            effectiveLimit: 0,
            budgetMs: options.budgetMs,
            elapsedMs,
            remainingMs,
            nextRecommendedPingAt,
        };
    }

    try {
        const settings = await prisma.appSettings.findUnique({
            where: { id: "singleton" },
            select: { activeMarketSource: true },
        });
        const attemptedProvider = resolveMarketSource(settings?.activeMarketSource);
        const effectiveLimit = attemptedProvider === "steam"
            ? Math.min(requestedLimit, STEAM_SAFE_LIMIT)
            : requestedLimit;

        const beforeRead = buildTiming(startTime, options.budgetMs);
        if (beforeRead.remainingMs <= 0) {
            return {
                status: "time_budget_exhausted",
                reason: "time_budget_exhausted",
                selected: 0,
                processed: 0,
                pricedCount: 0,
                skippedRecent: 0,
                remainingDue: 0,
                attemptedProvider,
                requestedLimit,
                effectiveLimit,
                budgetMs: options.budgetMs,
                elapsedMs: beforeRead.elapsedMs,
                remainingMs: beforeRead.remainingMs,
                nextRecommendedPingAt,
            };
        }

        const activeItems = await prisma.item.findMany({
            where: { isActive: true },
            select: { id: true, marketHashName: true },
        });

        if (activeItems.length === 0) {
            const { elapsedMs, remainingMs } = buildTiming(startTime, options.budgetMs);
            return {
                status: "success",
                selected: 0,
                processed: 0,
                pricedCount: 0,
                skippedRecent: 0,
                remainingDue: 0,
                attemptedProvider,
                requestedLimit,
                effectiveLimit,
                budgetMs: options.budgetMs,
                elapsedMs,
                remainingMs,
                nextRecommendedPingAt,
            };
        }

        const cutoff = new Date(now.getTime() - options.minAgeMinutes * 60_000);
        const latestSnapshots = await prisma.priceSnapshot.findMany({
            where: {
                itemId: { in: activeItems.map((item) => item.id) },
                source: { not: "steam-intelligence" },
            },
            orderBy: { timestamp: "desc" },
            distinct: ["itemId"],
            select: { itemId: true, timestamp: true },
        });
        const latestByItemId = new Map(
            (latestSnapshots as LatestSnapshot[]).map((snapshot) => [snapshot.itemId, snapshot.timestamp])
        );
        const dueItems = activeItems
            .map((item) => ({ item, latestAt: latestByItemId.get(item.id) ?? null }))
            .filter(({ latestAt }) => latestAt === null || latestAt < cutoff)
            .sort(sortOldestFirst);

        const selectedItems = dueItems.slice(0, effectiveLimit).map(({ item }) => item);
        if (selectedItems.length === 0) {
            const { elapsedMs, remainingMs } = buildTiming(startTime, options.budgetMs);
            return {
                status: "success",
                selected: 0,
                processed: 0,
                pricedCount: 0,
                skippedRecent: 0,
                remainingDue: 0,
                attemptedProvider,
                requestedLimit,
                effectiveLimit,
                budgetMs: options.budgetMs,
                elapsedMs,
                remainingMs,
                nextRecommendedPingAt,
            };
        }

        const beforeWrite = buildTiming(startTime, options.budgetMs);
        if (beforeWrite.remainingMs <= 0) {
            return {
                status: "time_budget_exhausted",
                reason: "time_budget_exhausted",
                selected: 0,
                processed: 0,
                pricedCount: 0,
                skippedRecent: 0,
                remainingDue: dueItems.length,
                attemptedProvider,
                requestedLimit,
                effectiveLimit,
                budgetMs: options.budgetMs,
                elapsedMs: beforeWrite.elapsedMs,
                remainingMs: beforeWrite.remainingMs,
                nextRecommendedPingAt,
            };
        }

        const itemIdByHash = new Map(selectedItems.map((item) => [item.marketHashName, item.id]));
        const writeResult = await writePriceSnapshotsForItems(itemIdByHash, {
            overrideSource: attemptedProvider,
            maxItems: effectiveLimit,
            minAgeMinutes: options.minAgeMinutes,
            skipCandleAggregation: true,
            bulkOnly: true,
            allowFallback: false,
            fetchSteamVolume: false,
            deadlineAtMs: startTime + options.budgetMs,
            minRemainingMs: RESPONSE_HEADROOM_MS,
            maxRetries: 0,
        });
        const { elapsedMs, remainingMs } = buildTiming(startTime, options.budgetMs);
        const unpricedSelected = Math.max(0, selectedItems.length - writeResult.pricedCount);
        const remainingDue = Math.max(0, dueItems.length - selectedItems.length) + unpricedSelected;
        const timeBudgetExceeded = elapsedMs >= options.budgetMs;
        let status: BoundedPriceSyncStatus = "success";
        let reason = writeResult.failureReason;

        if (writeResult.failureReason) {
            status = "failed";
        } else if (timeBudgetExceeded) {
            status = "time_budget_exhausted";
            reason = "time_budget_exhausted";
        } else if (remainingDue > 0) {
            status = "partial";
        }

        return {
            status,
            ...(reason ? { reason } : {}),
            selected: selectedItems.length,
            processed: writeResult.totalRequested,
            pricedCount: writeResult.pricedCount,
            skippedRecent: writeResult.skippedRecent,
            remainingDue: status === "failed" ? dueItems.length : remainingDue,
            provider: writeResult.provider,
            attemptedProvider: writeResult.attemptedProvider,
            requestedLimit,
            effectiveLimit,
            budgetMs: options.budgetMs,
            elapsedMs,
            remainingMs,
            nextRecommendedPingAt,
        };
    } catch (error) {
        const { elapsedMs, remainingMs } = buildTiming(startTime, options.budgetMs);
        return {
            status: "failed",
            reason: error instanceof Error ? error.message : String(error),
            selected: 0,
            processed: 0,
            pricedCount: 0,
            skippedRecent: 0,
            remainingDue: 0,
            requestedLimit,
            effectiveLimit: 0,
            budgetMs: options.budgetMs,
            elapsedMs,
            remainingMs,
            nextRecommendedPingAt,
        };
    } finally {
        await releaseSyncLock();
    }
}
