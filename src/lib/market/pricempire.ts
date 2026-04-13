/**
 * Pricempire Market Data Provider (Free Trader Tier)
 *
 * Endpoints:
 *   - /v4/paid/items/prices — bulk current prices
 *   - /v4/paid/items/prices/history — price history (Enterprise only)
 *
 * Auth: API key via query param ?api_key=...
 * Rate limits: ~30K calls/month (free tier ≈ 1K/day)
 * Prices are returned in USD cents.
 */

import type { BulkPriceFetchOptions, MarketDataProvider, PriceData, PricePoint, RateLimitConfig } from "@/types";
import { pricempireQueue } from "@/lib/api-queue";

const BASE_URL = "https://api.pricempire.com";

function getApiKey(): string {
    const key = process.env.PRICEMPIRE_API_KEY;
    if (!key) throw new Error("PRICEMPIRE_API_KEY is not configured");
    return key;
}

export const pricempireProvider: MarketDataProvider = {
    name: "pricempire",

    async fetchItemPrice(marketHashName: string): Promise<PriceData> {
        const data = await pricempireQueue.enqueue(async () => {
            const url = new URL(`${BASE_URL}/v4/paid/items/prices`);
            url.searchParams.set("api_key", getApiKey());
            url.searchParams.set("market_hash_name", marketHashName);
            url.searchParams.set("currency", "USD");
            url.searchParams.set("source", "buff,steam");

            const res = await fetch(url.toString());
            if (!res.ok) {
                throw new Error(`Pricempire API error: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });

        // The API returns prices in cents — convert to dollars
        const itemData = data?.[marketHashName] ?? data;
        const steamPrice = itemData?.steam?.price ?? itemData?.buff?.price ?? 0;

        return {
            price: steamPrice / 100,
            volume: itemData?.steam?.volume ?? undefined,
            source: "pricempire",
            timestamp: new Date(),
        };
    },

    async fetchBulkPrices(items: string[], _options?: BulkPriceFetchOptions): Promise<Map<string, PriceData>> {
        const result = new Map<string, PriceData>();

        // Pricempire supports bulk fetching via a single endpoint
        const data = await pricempireQueue.enqueue(async () => {
            const url = new URL(`${BASE_URL}/v4/paid/items/prices`);
            url.searchParams.set("api_key", getApiKey());
            url.searchParams.set("currency", "USD");
            url.searchParams.set("source", "buff,steam");

            const res = await fetch(url.toString());
            if (!res.ok) {
                throw new Error(`Pricempire API error: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });

        for (const marketHashName of items) {
            const itemData = data?.[marketHashName];
            if (itemData) {
                const price = itemData?.steam?.price ?? itemData?.buff?.price ?? 0;
                result.set(marketHashName, {
                    price: price / 100,
                    volume: itemData?.steam?.volume ?? undefined,
                    source: "pricempire",
                    timestamp: new Date(),
                });
            }
        }

        return result;
    },

    async fetchItemHistory(marketHashName: string, days: number): Promise<PricePoint[]> {
        // Note: History endpoint is Enterprise-only on Pricempire.
        // On free tier, we return an empty array and rely on local snapshot accumulation.
        console.warn(
            `[Pricempire] Price history for "${marketHashName}" (${days}d) ` +
            "requires Enterprise tier. Returning empty — use local snapshots instead."
        );
        return [];
    },

    getRateLimitConfig(): RateLimitConfig {
        return {
            maxRequestsPerMinute: 10,
            maxRequestsPerDay: 1000,
            minDelayMs: 1000,
        };
    },
};

/**
 * Fetch ALL item prices from Pricempire (full market catalog).
 * Unlike fetchBulkPrices which filters by a provided list,
 * this returns every item in the Pricempire response.
 */
export async function fetchAllPrices(): Promise<Map<string, PriceData>> {
    const result = new Map<string, PriceData>();

    const data = await pricempireQueue.enqueue(async () => {
        const url = new URL(`${BASE_URL}/v4/paid/items/prices`);
        url.searchParams.set("api_key", getApiKey());
        url.searchParams.set("currency", "USD");
        url.searchParams.set("source", "buff,steam");

        const res = await fetch(url.toString());
        if (!res.ok) {
            throw new Error(`Pricempire API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
    });

    for (const marketHashName of Object.keys(data)) {
        const itemData = data[marketHashName];
        if (itemData) {
            const price = itemData?.steam?.price ?? itemData?.buff?.price ?? 0;
            result.set(marketHashName, {
                price: price / 100,
                volume: itemData?.steam?.volume ?? undefined,
                source: "pricempire",
                timestamp: new Date(),
            });
        }
    }

    return result;
}
