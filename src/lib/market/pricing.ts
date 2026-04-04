/**
 * Market Price Fetch Helpers
 *
 * Fetches bulk price data for a list of market hash names using the
 * active provider (with Steam fallback).
 */

import { prisma } from "@/lib/db";
import { initializeMarketProviders } from "@/lib/market/init";
import { getMarketProvider } from "@/lib/market/registry";
import { aggregateAllIntervals } from "@/lib/candles/aggregator";
import type { MarketDataProvider, MarketSource, PriceData } from "@/types";

export interface BulkPriceResult {
    prices: Map<string, PriceData>;
    provider: MarketSource;
    fallbackAvailable: boolean;
    failureReason?: string;
}

export interface PriceSnapshotWriteResult {
    totalCandidates: number;
    totalRequested: number;
    pricedCount: number;
    provider: MarketSource;
    attemptedProvider: MarketSource;
    skippedRecent: number;
    limitedTo?: number;
    fallbackAvailable: boolean;
    failureReason?: string;
}

export interface PriceWriteOptions {
    overrideSource?: MarketSource;
    minAgeMinutes?: number;
    maxItems?: number;
    allowSteamLimit?: boolean;
    allowFallback?: boolean;
    skipCandleAggregation?: boolean;
}

const DEFAULT_STEAM_BATCH_SIZE = 25;
const DEFAULT_MIN_AGE_MINUTES = 5;

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getSteamBatchSize(): number {
    const raw = process.env.STEAM_PRICE_BATCH_SIZE;
    if (!raw) return DEFAULT_STEAM_BATCH_SIZE;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_STEAM_BATCH_SIZE;
    return clampNumber(parsed, 1, 200);
}

function getMinAgeMinutes(override?: number): number {
    if (override !== undefined) return override;
    const raw = process.env.PRICE_SNAPSHOT_MIN_AGE_MINUTES;
    if (!raw) return DEFAULT_MIN_AGE_MINUTES;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MIN_AGE_MINUTES;
    return clampNumber(parsed, 0, 24 * 60);
}

async function getPreferredMarketSource(
    overrideSource?: MarketSource
): Promise<MarketSource> {
    await initializeMarketProviders();

    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
    });
    const preferred: MarketSource =
        overrideSource ?? (settings?.activeMarketSource as MarketSource) ?? "csfloat";

    return preferred;
}

function getProviderLabel(provider: MarketSource): string {
    switch (provider) {
        case "csfloat":
            return "CSFloat";
        case "csgotrader":
            return "CSGOTrader";
        case "pricempire":
            return "PriceEmpire";
        case "steam":
            return "Steam";
        default:
            return provider;
    }
}

async function resolveMarketProviderInfo(
    overrideSource?: MarketSource
): Promise<{
    provider?: MarketDataProvider;
    attemptedProvider: MarketSource;
    fallbackAvailable: boolean;
    failureReason?: string;
}> {
    const preferred = await getPreferredMarketSource(overrideSource);
    try {
        return {
            provider: getMarketProvider(preferred),
            attemptedProvider: preferred,
            fallbackAvailable: false,
        };
    } catch {
        return {
            attemptedProvider: preferred,
            fallbackAvailable: true,
            failureReason: `${getProviderLabel(preferred)} provider not registered`,
        };
    }
}

function applyProviderLimits(
    entries: [string, string][],
    providerName: MarketSource,
    options: PriceWriteOptions,
    latestMap: Map<string, Date>
): { entries: [string, string][]; limitedTo?: number } {
    let filteredEntries = entries;
    let limitedTo: number | undefined;

    if (providerName === "steam") {
        filteredEntries = filteredEntries
            .slice()
            .sort(([, aId], [, bId]) => {
                const aTs = latestMap.get(aId)?.getTime() ?? 0;
                const bTs = latestMap.get(bId)?.getTime() ?? 0;
                return aTs - bTs;
            });

        const shouldLimit = options.allowSteamLimit !== false;
        if (shouldLimit) {
            const limit = options.maxItems ?? getSteamBatchSize();
            if (filteredEntries.length > limit) {
                filteredEntries = filteredEntries.slice(0, limit);
                limitedTo = limit;
            }
        }
    } else if (options.maxItems && filteredEntries.length > options.maxItems) {
        filteredEntries = filteredEntries.slice(0, options.maxItems);
        limitedTo = options.maxItems;
    }

    return { entries: filteredEntries, limitedTo };
}

export async function fetchBulkPricesForHashNames(
    hashNames: string[],
    overrideSource?: MarketSource
): Promise<BulkPriceResult> {
    if (hashNames.length === 0) {
        return {
            prices: new Map(),
            provider: overrideSource ?? "csfloat",
            fallbackAvailable: false,
        };
    }

    const providerInfo = await resolveMarketProviderInfo(overrideSource);
    if (!providerInfo.provider) {
        return {
            prices: new Map(),
            provider: providerInfo.attemptedProvider,
            fallbackAvailable: providerInfo.fallbackAvailable,
            failureReason: providerInfo.failureReason,
        };
    }

    const provider = providerInfo.provider;
    let prices: Map<string, PriceData>;

    try {
        prices = await provider.fetchBulkPrices(hashNames);
    } catch (error) {
        return {
            prices: new Map(),
            provider: provider.name as MarketSource,
            fallbackAvailable: provider.name !== "steam",
            failureReason: `${getProviderLabel(provider.name as MarketSource)} provider failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
    }

    if (prices.size === 0) {
        return {
            prices: new Map(),
            provider: provider.name as MarketSource,
            fallbackAvailable: provider.name !== "steam",
            failureReason: `${getProviderLabel(provider.name as MarketSource)} returned 0 prices for ${hashNames.length} items`,
        };
    }

    return {
        prices,
        provider: provider.name as MarketSource,
        fallbackAvailable: false,
    };
}

export async function writePriceSnapshotsForItems(
    itemIdByHash: Map<string, string>,
    options: PriceWriteOptions = {}
): Promise<PriceSnapshotWriteResult> {
    const entries = [...itemIdByHash.entries()];
    if (entries.length === 0) {
        const attemptedProvider = options.overrideSource ?? "csfloat";
        return {
            totalCandidates: 0,
            totalRequested: 0,
            pricedCount: 0,
            provider: attemptedProvider,
            attemptedProvider,
            skippedRecent: 0,
            fallbackAvailable: false,
        };
    }

    const providerInfo = await resolveMarketProviderInfo(options.overrideSource);
    const attemptedProvider = providerInfo.attemptedProvider;
    let provider = providerInfo.provider;
    const minAgeMinutes = getMinAgeMinutes(options.minAgeMinutes);
    const cutoff = minAgeMinutes > 0
        ? new Date(Date.now() - minAgeMinutes * 60 * 1000)
        : null;

    const itemIds = entries.map(([, itemId]) => itemId);
    const latestSnapshots = await prisma.priceSnapshot.findMany({
        where: { itemId: { in: itemIds } },
        orderBy: { timestamp: "desc" },
        distinct: ["itemId"],
        select: { itemId: true, timestamp: true },
    });
    const latestMap = new Map(latestSnapshots.map((snap) => [snap.itemId, snap.timestamp]));

    let filteredEntries = entries;
    let skippedRecent = 0;

    if (cutoff) {
        filteredEntries = entries.filter(([, itemId]) => {
            const last = latestMap.get(itemId);
            return !last || last < cutoff;
        });
        skippedRecent = entries.length - filteredEntries.length;
    }

    let providerNameForLimits = provider
        ? (provider.name as MarketSource)
        : attemptedProvider;

    if (!provider && options.allowFallback) {
        provider = getMarketProvider("steam");
        providerNameForLimits = "steam";
    }

    let { entries: entriesToFetch, limitedTo } = applyProviderLimits(
        filteredEntries,
        providerNameForLimits,
        options,
        latestMap
    );

    let hashNames = entriesToFetch.map(([hashName]) => hashName);
    if (hashNames.length === 0) {
        return {
            totalCandidates: entries.length,
            totalRequested: 0,
            pricedCount: 0,
            provider: providerNameForLimits,
            attemptedProvider,
            skippedRecent,
            limitedTo,
            fallbackAvailable: provider ? false : providerInfo.fallbackAvailable,
            failureReason: provider ? undefined : providerInfo.failureReason,
        };
    }

    if (!provider) {
        return {
            totalCandidates: entries.length,
            totalRequested: hashNames.length,
            pricedCount: 0,
            provider: attemptedProvider,
            attemptedProvider,
            skippedRecent,
            limitedTo,
            fallbackAvailable: providerInfo.fallbackAvailable,
            failureReason: providerInfo.failureReason,
        };
    }
    let prices: Map<string, PriceData>;
    try {
        prices = await provider.fetchBulkPrices(hashNames);
    } catch (error) {
        if (options.allowFallback && provider.name !== "steam") {
            provider = getMarketProvider("steam");
            ({ entries: entriesToFetch, limitedTo } = applyProviderLimits(
                filteredEntries,
                "steam",
                options,
                latestMap
            ));
            hashNames = entriesToFetch.map(([hashName]) => hashName);
            if (hashNames.length === 0) {
                return {
                    totalCandidates: entries.length,
                    totalRequested: 0,
                    pricedCount: 0,
                    provider: provider.name as MarketSource,
                    attemptedProvider,
                    skippedRecent,
                    limitedTo,
                    fallbackAvailable: false,
                };
            }
            prices = await provider.fetchBulkPrices(hashNames);
        } else {
            return {
                totalCandidates: entries.length,
                totalRequested: hashNames.length,
                pricedCount: 0,
                provider: provider.name as MarketSource,
                attemptedProvider,
                skippedRecent,
                limitedTo,
                fallbackAvailable: provider.name !== "steam",
                failureReason: `${getProviderLabel(provider.name as MarketSource)} provider failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
        }
    }

    if (prices.size === 0) {
        if (options.allowFallback && provider.name !== "steam") {
            provider = getMarketProvider("steam");
            ({ entries: entriesToFetch, limitedTo } = applyProviderLimits(
                filteredEntries,
                "steam",
                options,
                latestMap
            ));
            hashNames = entriesToFetch.map(([hashName]) => hashName);
            if (hashNames.length === 0) {
                return {
                    totalCandidates: entries.length,
                    totalRequested: 0,
                    pricedCount: 0,
                    provider: provider.name as MarketSource,
                    attemptedProvider,
                    skippedRecent,
                    limitedTo,
                    fallbackAvailable: false,
                };
            }
            prices = await provider.fetchBulkPrices(hashNames);
        } else {
            return {
                totalCandidates: entries.length,
                totalRequested: hashNames.length,
                pricedCount: 0,
                provider: provider.name as MarketSource,
                attemptedProvider,
                skippedRecent,
                limitedTo,
                fallbackAvailable: provider.name !== "steam",
                failureReason: `${getProviderLabel(provider.name as MarketSource)} returned 0 prices for ${hashNames.length} items`,
            };
        }
    }
    // Batch all snapshot creates into a single INSERT
    const snapshotsToCreate: Array<{
        itemId: string;
        price: number;
        volume: number | null;
        source: string;
        timestamp: Date;
    }> = [];

    for (const [hashName, itemId] of entriesToFetch) {
        const priceData = prices.get(hashName);
        if (!priceData || priceData.price <= 0) continue;

        snapshotsToCreate.push({
            itemId,
            price: priceData.price,
            volume: priceData.volume ?? null,
            source: priceData.source,
            timestamp: priceData.timestamp,
        });
    }

    if (snapshotsToCreate.length > 0) {
        await prisma.priceSnapshot.createMany({ data: snapshotsToCreate });
    }

    const pricedCount = snapshotsToCreate.length;

    // Aggregate candles after all writes (skip during inventory sync for speed)
    if (!options.skipCandleAggregation && pricedCount > 0) {
        const uniqueItemIds = [...new Set(snapshotsToCreate.map((s) => s.itemId))];
        for (const itemId of uniqueItemIds) {
            await aggregateAllIntervals(itemId);
        }
    }

    return {
        totalCandidates: entries.length,
        totalRequested: hashNames.length,
        pricedCount,
        provider: provider.name as MarketSource,
        attemptedProvider,
        skippedRecent,
        limitedTo,
        fallbackAvailable: false,
    };
}
