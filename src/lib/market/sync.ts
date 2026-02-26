/**
 * Market Data Sync Orchestrator
 * 
 * Coordinates fetching market data from the active provider,
 * storing price snapshots, and triggering candlestick aggregation.
 */

import { prisma } from "@/lib/db";
import { getMarketProvider } from "@/lib/market/registry";
import { aggregateAllIntervals } from "@/lib/candles/aggregator";
import type { MarketSource, SyncResult } from "@/types";

/**
 * Run a full sync cycle:
 * 1. Read app settings to determine active provider and scope
 * 2. Fetch prices from the active provider
 * 3. Store snapshots in the database
 * 4. Aggregate candlestick data
 * 5. Log the sync result
 */
export async function runSync(overrideSource?: MarketSource): Promise<SyncResult> {
    const startTime = Date.now();

    // Get app settings
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
    });

    const preferredSource = overrideSource ?? (settings?.activeMarketSource as MarketSource) ?? "steam";
    const source = preferredSource === "pricempire" ? "steam" : preferredSource;
    const watchlistOnly = settings?.watchlistOnly ?? true;

    try {
        // Get items to sync
        const items = await prisma.item.findMany({
            where: watchlistOnly
                ? { isWatched: true, isActive: true }
                : { isActive: true },
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
        let provider;
        try {
            provider = getMarketProvider(source);
        } catch {
            // Active provider not registered (API key missing) — fall back to steam
            console.warn(`[Sync] Provider "${source}" not available, falling back to "steam"`);
            provider = getMarketProvider("steam");
        }
        const hashNames = items.map((i) => i.marketHashName);
        let prices: Map<string, { price: number; volume?: number; source: string; timestamp: Date }>;
        try {
            prices = await provider.fetchBulkPrices(hashNames);
        } catch (error) {
            if (provider.name !== "steam") {
                console.warn(`[Sync] Provider "${provider.name}" failed, falling back to "steam"`);
                provider = getMarketProvider("steam");
                prices = await provider.fetchBulkPrices(hashNames);
            } else {
                throw error;
            }
        }

        if (prices.size === 0 && provider.name !== "steam") {
            console.warn(`[Sync] Provider "${provider.name}" returned no prices, falling back to "steam"`);
            provider = getMarketProvider("steam");
            prices = await provider.fetchBulkPrices(hashNames);
        }

        // Store price snapshots
        let storedCount = 0;
        for (const item of items) {
            const priceData = prices.get(item.marketHashName);
            if (priceData && priceData.price > 0) {
                await prisma.priceSnapshot.create({
                    data: {
                        itemId: item.id,
                        price: priceData.price,
                        volume: priceData.volume,
                        source: priceData.source,
                        timestamp: priceData.timestamp,
                    },
                });
                storedCount++;

                // Aggregate candlesticks for this item
                await aggregateAllIntervals(item.id);
            }
        }

        const result: SyncResult = {
            type: "market_prices",
            status: storedCount === items.length ? "success" : "partial",
            itemCount: storedCount,
            duration: Date.now() - startTime,
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
