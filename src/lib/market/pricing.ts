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
}

export interface PriceSnapshotWriteResult {
    totalCandidates: number;
    totalRequested: number;
    pricedCount: number;
    provider: MarketSource;
    skippedRecent: number;
    limitedTo?: number;
}

export interface PriceWriteOptions {
    overrideSource?: MarketSource;
    minAgeMinutes?: number;
    maxItems?: number;
    allowSteamLimit?: boolean;
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

function normalizeMarketSourceForPrices(source?: MarketSource): MarketSource {
    if (!source) return "steam";
    if (source === "pricempire") return "steam";
    return source;
}

async function resolveMarketProvider(
    overrideSource?: MarketSource
): Promise<MarketDataProvider> {
    await initializeMarketProviders();

    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
    });
    const preferred = normalizeMarketSourceForPrices(
        overrideSource ?? (settings?.activeMarketSource as MarketSource)
    );

    try {
        return getMarketProvider(preferred);
    } catch {
        console.warn(
            `[Prices] Provider "${preferred}" not available, falling back to "steam"`
        );
        return getMarketProvider("steam");
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
        return { prices: new Map(), provider: overrideSource ?? "steam" };
    }

    let provider = await resolveMarketProvider(overrideSource);
    let prices: Map<string, PriceData>;

    try {
        prices = await provider.fetchBulkPrices(hashNames);
    } catch (error) {
        if (provider.name !== "steam") {
            console.warn(
                `[Prices] Provider "${provider.name}" failed, falling back to "steam"`
            );
            provider = getMarketProvider("steam");
            prices = await provider.fetchBulkPrices(hashNames);
        } else {
            throw error;
        }
    }

    if (prices.size === 0 && provider.name !== "steam") {
        console.warn(
            `[Prices] Provider "${provider.name}" returned no prices, falling back to "steam"`
        );
        provider = getMarketProvider("steam");
        prices = await provider.fetchBulkPrices(hashNames);
    }

    return {
        prices,
        provider: provider.name as MarketSource,
    };
}

export async function writePriceSnapshotsForItems(
    itemIdByHash: Map<string, string>,
    options: PriceWriteOptions = {}
): Promise<PriceSnapshotWriteResult> {
    const entries = [...itemIdByHash.entries()];
    if (entries.length === 0) {
        return {
            totalCandidates: 0,
            totalRequested: 0,
            pricedCount: 0,
            provider: options.overrideSource ?? "steam",
            skippedRecent: 0,
        };
    }

    let provider = await resolveMarketProvider(options.overrideSource);
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

    let { entries: entriesToFetch, limitedTo } = applyProviderLimits(
        filteredEntries,
        provider.name as MarketSource,
        options,
        latestMap
    );

    let hashNames = entriesToFetch.map(([hashName]) => hashName);
    if (hashNames.length === 0) {
        return {
            totalCandidates: entries.length,
            totalRequested: 0,
            pricedCount: 0,
            provider: provider.name as MarketSource,
            skippedRecent,
            limitedTo,
        };
    }

    let prices: Map<string, PriceData>;
    try {
        prices = await provider.fetchBulkPrices(hashNames);
    } catch (error) {
        if (provider.name !== "steam") {
            console.warn(
                `[Prices] Provider "${provider.name}" failed, falling back to "steam"`
            );
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
                    skippedRecent,
                    limitedTo,
                };
            }
            prices = await provider.fetchBulkPrices(hashNames);
        } else {
            throw error;
        }
    }

    if (prices.size === 0 && provider.name !== "steam") {
        console.warn(
            `[Prices] Provider "${provider.name}" returned no prices, falling back to "steam"`
        );
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
                skippedRecent,
                limitedTo,
            };
        }
        prices = await provider.fetchBulkPrices(hashNames);
    }
    let pricedCount = 0;

    for (const [hashName, itemId] of entriesToFetch) {
        const priceData = prices.get(hashName);
        if (!priceData || priceData.price <= 0) continue;

        await prisma.priceSnapshot.create({
            data: {
                itemId,
                price: priceData.price,
                volume: priceData.volume,
                source: priceData.source,
                timestamp: priceData.timestamp,
            },
        });
        pricedCount++;

        await aggregateAllIntervals(itemId);
    }

    return {
        totalCandidates: entries.length,
        totalRequested: hashNames.length,
        pricedCount,
        provider: provider.name as MarketSource,
        skippedRecent,
        limitedTo,
    };
}
