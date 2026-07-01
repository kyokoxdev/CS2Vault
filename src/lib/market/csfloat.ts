/**
 * CSFloat Market Data Provider
 *
 * Endpoints:
 *   - /api/v1/listings — active market listings (with item SCM prices)
 *   - /api/v1/history/{item}/sales — recent sales (40 most recent)
 *
 * Auth: API key via Authorization header
 * Prices are returned in USD cents.
 * Rate limits: per-endpoint, not publicly documented — we use conservative 1 req/2s.
 */

import type { BulkPriceFetchOptions, MarketDataProvider, PriceData, PricePoint, RateLimitConfig } from "@/types";
import { csfloatQueue } from "@/lib/api-queue";
import { prisma } from "@/lib/db";
import { createDeadlineSignal } from "@/lib/deadline";
import { parseSimplePriceFormat, type PriceVolumeEntry } from "@/lib/market/csgotrader-parsers";

const BASE_URL = "https://csfloat.com/api/v1";
const BULK_CACHE_URL = "https://prices.csgotrader.app/latest/csfloat.json";
const BULK_CACHE_TTL_MS = 30 * 60 * 1000;

let bulkPriceCache: Map<string, PriceVolumeEntry> | null = null;
let bulkCacheTimestamp = 0;

async function getBulkPriceCache(options?: BulkPriceFetchOptions): Promise<Map<string, PriceVolumeEntry>> {
    const now = Date.now();

    if (bulkPriceCache && now - bulkCacheTimestamp < BULK_CACHE_TTL_MS) {
        return bulkPriceCache;
    }

    try {
        const dbCache = await prisma.bulkPriceCache.findUnique({
            where: { id: "singleton" },
        });
        if (dbCache) {
            const dbAge = now - dbCache.updatedAt.getTime();
            if (dbAge < BULK_CACHE_TTL_MS) {
                const parsed = JSON.parse(dbCache.data) as Record<string, { price: number | null; volume?: number | null }>;
                bulkPriceCache = parseSimplePriceFormat(parsed);
                bulkCacheTimestamp = dbCache.updatedAt.getTime();
                return bulkPriceCache;
            }
        }
    } catch (error) {
        console.warn("[CSFloat Bulk] Failed to read DB cache:", error instanceof Error ? error.message : error);
    }

    try {
        const res = await fetch(BULK_CACHE_URL, {
            signal: createDeadlineSignal(options, 10_000),
        });
        if (!res.ok) {
            console.warn(`[CSFloat Bulk] Failed to fetch bulk cache: ${res.status}`);
            return bulkPriceCache ?? new Map();
        }

        const data = await res.json();
        bulkPriceCache = parseSimplePriceFormat(data as Record<string, { price: number | null; volume?: number | null }>);
        bulkCacheTimestamp = now;

        try {
            await prisma.bulkPriceCache.upsert({
                where: { id: "singleton" },
                update: {
                    data: JSON.stringify(data),
                    updatedAt: new Date(now),
                },
                create: {
                    id: "singleton",
                    data: JSON.stringify(data),
                    updatedAt: new Date(now),
                },
            });
        } catch (error) {
            console.warn("[CSFloat Bulk] Failed to persist cache to DB:", error instanceof Error ? error.message : error);
        }

        return bulkPriceCache;
    } catch (error) {
        console.warn("[CSFloat Bulk] CDN fetch failed or timed out:", error instanceof Error ? error.message : error);
        return bulkPriceCache ?? new Map();
    }
}

async function getApiKey(): Promise<string> {
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    const key = settings?.csfloatApiKey || process.env.CSFLOAT_API_KEY;
    if (!key) throw new Error("CSFLOAT_API_KEY is not configured in DB or ENV");
    return key;
}

async function makeHeaders(): Promise<HeadersInit> {
    return {
        Authorization: await getApiKey(),
        "Content-Type": "application/json",
    };
}

interface CSFloatListing {
    id: string;
    price: number; // cents
    item: {
        market_hash_name: string;
        float_value: number;
        paint_seed: number;
        icon_url: string;
        scm?: {
            price: number;  // Steam Community Market price in cents
            volume: number;
        };
        item_name: string;
        wear_name: string;
    };
}

export const csfloatProvider: MarketDataProvider = {
    name: "csfloat",

    async fetchItemPrice(marketHashName: string): Promise<PriceData> {
        const bulkCache = await getBulkPriceCache();
        const entry = bulkCache.get(marketHashName);
        if (entry !== undefined) {
            return {
                price: entry.price,
                volume: entry.volume,
                source: "csfloat",
                timestamp: new Date(),
            };
        }

        return fetchItemPriceFromApi(marketHashName);
    },

    async fetchBulkPrices(items: string[], options?: BulkPriceFetchOptions): Promise<Map<string, PriceData>> {
        const result = new Map<string, PriceData>();
        const bulkCache = await getBulkPriceCache(options);
        const missingItems: string[] = [];

        for (const marketHashName of items) {
            const entry = bulkCache.get(marketHashName);
            if (entry !== undefined) {
                result.set(marketHashName, {
                    price: entry.price,
                    volume: entry.volume,
                    source: "csfloat",
                    timestamp: new Date(),
                });
                continue;
            }
            missingItems.push(marketHashName);
        }

        if (options?.bulkOnly) {
            return result;
        }

        for (const marketHashName of missingItems) {
            try {
                const priceData = await fetchItemPriceFromApi(marketHashName, options);
                result.set(marketHashName, priceData);
            } catch (error) {
                console.warn(
                    `[CSFloat] Failed to fetch price for "${marketHashName}":`,
                    error instanceof Error ? error.message : error
                );
            }
        }

        return result;
    },

    async fetchItemHistory(marketHashName: string): Promise<PricePoint[]> {
        // CSFloat provides recent sales via the history endpoint
        const sales = await csfloatQueue.enqueue(async () => {
            const encoded = encodeURIComponent(marketHashName);
            const url = `${BASE_URL}/history/${encoded}/sales`;

            const headers = await makeHeaders();
            const res = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) {
                if (res.status === 404) return [];
                throw new Error(`CSFloat history error: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });

        if (!Array.isArray(sales)) return [];

        return sales.map((sale: { sold_at: string; price: number }) => ({
            price: sale.price / 100,
            timestamp: new Date(sale.sold_at),
        }));
    },

    getRateLimitConfig(): RateLimitConfig {
        return {
            maxRequestsPerMinute: 30,
            maxRequestsPerDay: 5000,
            minDelayMs: 2000,
        };
    },
};

async function fetchItemPriceFromApi(marketHashName: string, options?: BulkPriceFetchOptions): Promise<PriceData> {
    const listings = await csfloatQueue.enqueue(async () => {
        const url = new URL(`${BASE_URL}/listings`);
        url.searchParams.set("market_hash_name", marketHashName);
        url.searchParams.set("sort_by", "lowest_price");
        url.searchParams.set("limit", "5");

        const headers = await makeHeaders();
        const res = await fetch(url.toString(), {
            headers,
            signal: createDeadlineSignal(options, 15_000),
        });
        if (!res.ok) {
            throw new Error(`CSFloat API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<CSFloatListing[]>;
    }, 0, options);

    if (!listings || listings.length === 0) {
        throw new Error(`No CSFloat listings found for "${marketHashName}"`);
    }

    // Use the lowest listing price as the current price
    const lowest = listings[0];
    const priceUsd = lowest.price / 100;

    return {
        price: priceUsd,
        volume: lowest.item.scm?.volume ?? undefined,
        source: "csfloat",
        timestamp: new Date(),
    };
}
