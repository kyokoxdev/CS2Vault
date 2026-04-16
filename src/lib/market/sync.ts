/**
 * Market Data Sync Orchestrator
 * 
 * Coordinates fetching market data from the active provider,
 * storing price snapshots, and triggering candlestick aggregation.
 */

import { prisma } from "@/lib/db";
import { initializeMarketProviders } from "@/lib/market/init";
import { getMarketProvider } from "@/lib/market/registry";
import { resolveMarketSource } from "@/lib/market/source";
import { aggregateCandlesticks, type CandleInterval } from "@/lib/candles/aggregator";
import { acquireSyncLock, releaseSyncLock } from "@/lib/market/sync-lock";
import type { MarketSource, SyncResult } from "@/types";

/** Options for controlling sync behaviour (e.g. cron vs manual). */
export interface SyncOptions {
    overrideSource?: MarketSource;
    /**
     * Which candle intervals to aggregate after storing snapshots.
     * Defaults to ALL intervals.  The cron path should pass only
     * ["1d", "1w"] because sub-daily intervals are meaningless for
     * a once-per-day sync — those are populated by browser refreshes.
     */
    candleIntervals?: CandleInterval[];
}

/**
 * Run a full sync cycle:
 * 1. Read app settings to determine active provider and scope
 * 2. Fetch prices from the active provider
 * 3. Store snapshots in the database
 * 4. Aggregate candlestick data
 * 5. Log the sync result
 */
export async function runSync(opts: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();

    const acquired = await acquireSyncLock();
    if (!acquired) {
        console.warn("[Sync] Another sync is in progress — skipping this cycle");
        const result: SyncResult = {
            type: "market_prices",
            status: "failed",
            itemCount: 0,
            duration: Date.now() - startTime,
            error: "Another sync is already in progress",
        };
        await logSync(result);
        return result;
    }

    try {
        return await runSyncInner(opts, startTime);
    } finally {
        await releaseSyncLock();
    }
}

const ALL_CANDLE_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
const AGGREGATION_BATCH_SIZE = 10;

async function runSyncInner(opts: SyncOptions, startTime: number): Promise<SyncResult> {
    // Get app settings
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
    });

    const preferredSource = opts.overrideSource ?? resolveMarketSource(settings?.activeMarketSource);
    const source = preferredSource;
    const intervals = opts.candleIntervals ?? ALL_CANDLE_INTERVALS;

    try {
        // Get items to sync
        const items = await prisma.item.findMany({
            where: { isActive: true },
            select: { id: true, marketHashName: true },
        });

        if (items.length === 0) {
            const result: SyncResult = {
                type: "market_prices",
                status: "success",
                itemCount: 0,
                duration: Date.now() - startTime,
            };
            await logSync(result);
            return result;
        }

        // Fetch prices from active provider
        await initializeMarketProviders();
        let provider: ReturnType<typeof getMarketProvider>;
        let failureReason: string | undefined;
        try {
            provider = getMarketProvider(source);
        } catch {
            failureReason = `Provider "${source}" not registered`;
            console.warn(`[Sync] ${failureReason} — skipping sync cycle`);

            const result: SyncResult = {
                type: "market_prices",
                status: "failed",
                itemCount: 0,
                duration: Date.now() - startTime,
                error: failureReason,
                fallbackAvailable: true,
                failureReason,
                attemptedProvider: source,
            };
            await logSync(result);
            return result;
        }
        const hashNames = items.map((i) => i.marketHashName);
        let prices: Map<string, { price: number; volume?: number; source: string; timestamp: Date }>;
        try {
            prices = await provider.fetchBulkPrices(hashNames);
        } catch (error) {
            failureReason = `Provider "${provider.name}" failed: ${error instanceof Error ? error.message : "Unknown error"}`;
            console.warn(`[Sync] ${failureReason} — skipping sync cycle`);

            const result: SyncResult = {
                type: "market_prices",
                status: "failed",
                itemCount: 0,
                duration: Date.now() - startTime,
                error: failureReason,
                fallbackAvailable: provider.name !== "steam",
                failureReason,
                attemptedProvider: source,
            };
            await logSync(result);
            return result;
        }

        if (prices.size === 0) {
            failureReason = `Provider "${provider.name}" returned 0 prices for ${hashNames.length} items`;
            console.warn(`[Sync] ${failureReason} — skipping sync cycle`);

            const result: SyncResult = {
                type: "market_prices",
                status: "failed",
                itemCount: 0,
                duration: Date.now() - startTime,
                error: failureReason,
                fallbackAvailable: provider.name !== "steam",
                failureReason,
                attemptedProvider: source,
            };
            await logSync(result);
            return result;
        }

        const snapshotsToCreate: Array<{
            itemId: string;
            price: number;
            volume: number | null;
            source: string;
            timestamp: Date;
        }> = [];

        for (const item of items) {
            const priceData = prices.get(item.marketHashName);
            if (priceData && priceData.price > 0) {
                snapshotsToCreate.push({
                    itemId: item.id,
                    price: priceData.price,
                    volume: priceData.volume ?? null,
                    source: priceData.source,
                    timestamp: priceData.timestamp,
                });
            }
        }

        if (snapshotsToCreate.length > 0) {
            await prisma.priceSnapshot.createMany({ data: snapshotsToCreate });
        }

        const storedCount = snapshotsToCreate.length;

        // Aggregate candles in batches to avoid overwhelming the DB
        const uniqueItemIds = [...new Set(snapshotsToCreate.map((s) => s.itemId))];
        for (let i = 0; i < uniqueItemIds.length; i += AGGREGATION_BATCH_SIZE) {
            const batch = uniqueItemIds.slice(i, i + AGGREGATION_BATCH_SIZE);
            await Promise.all(
                batch.flatMap((id) =>
                    intervals.map((interval) => aggregateCandlesticks(id, interval))
                )
            );
        }

        const result: SyncResult = {
            type: "market_prices",
            status: storedCount === items.length ? "success" : "partial",
            itemCount: storedCount,
            duration: Date.now() - startTime,
            attemptedProvider: source,
        };

        await logSync(result);
        return result;
    } catch (error) {
        const result: SyncResult = {
            type: "market_prices",
            status: "failed",
            itemCount: 0,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        };

        await logSync(result);
        return result;
    }
}

/**
 * Log a sync result to the database.
 */
async function logSync(result: SyncResult): Promise<void> {
    await prisma.syncLog.create({
        data: {
            type: result.type,
            status: result.status,
            itemCount: result.itemCount,
            duration: result.duration,
            error: result.error,
        },
    });
}

/**
 * Get recent sync logs for display.
 */
export async function getRecentSyncLogs(limit: number = 20) {
    return prisma.syncLog.findMany({
        orderBy: { timestamp: "desc" },
        take: limit,
    });
}

/**
 * Get the timestamp of the most recent price snapshot across all items.
 */
export async function getLatestPriceUpdate(): Promise<Date | null> {
    const latest = await prisma.priceSnapshot.findFirst({
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
    });
    return latest?.timestamp ?? null;
}
