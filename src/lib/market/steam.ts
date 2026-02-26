/**
 * Steam Community Market Data Provider (Fallback)
 *
 * Endpoints:
 *   - /market/priceoverview — single item price + volume
 *   - /ISteamEconomy/GetAssetPrices/v1 — asset prices by appid
 *
 * Auth: No API key needed for price overview (public endpoint).
 * Rate limits: ~20 req/min (aggressive, use as fallback only).
 * Prices returned as formatted strings ("$12.34") — parsed to float.
 */

import type { MarketDataProvider, PriceData, PricePoint, RateLimitConfig } from "@/types";
import { steamQueue } from "@/lib/api-queue";

const MARKET_BASE = "https://steamcommunity.com/market";
const CS2_APP_ID = "730";

/**
 * Parse Steam's "$12.34" price format to a number.
 */
export function parseSteamPrice(priceStr: string): number {
    // Remove currency symbols and whitespace
    let cleaned = priceStr.replace(/[^0-9.,]/g, "");

    // Handle thousands separators vs decimal commas:
    // If there's both commas and dots (e.g. "1,234.56"), commas are thousands separators
    // If there's only a comma (e.g. "12,34"), it's a decimal separator (European format)
    if (cleaned.includes(",") && cleaned.includes(".")) {
        // Has both: commas are thousands separators, dot is decimal
        cleaned = cleaned.replace(/,/g, "");
    } else if (cleaned.includes(",")) {
        // Only comma: treat as decimal separator
        cleaned = cleaned.replace(",", ".");
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

export const steamProvider: MarketDataProvider = {
    name: "steam",

    async fetchItemPrice(marketHashName: string): Promise<PriceData> {
        const data = await steamQueue.enqueue(async () => {
            const url = new URL(`${MARKET_BASE}/priceoverview/`);
            url.searchParams.set("appid", CS2_APP_ID);
            url.searchParams.set("currency", "1"); // USD
            url.searchParams.set("market_hash_name", marketHashName);

            const res = await fetch(url.toString());
            if (!res.ok) {
                throw new Error(`Steam Market API error: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });

        if (!data?.success) {
            throw new Error(`Steam Market returned no data for "${marketHashName}"`);
        }

        const price = parseSteamPrice(data.lowest_price ?? data.median_price ?? "$0");
        const medianPrice = parseSteamPrice(data.median_price ?? "$0");

        return {
            price: price || medianPrice,
            volume: data.volume ? parseInt(data.volume.replace(/,/g, ""), 10) : undefined,
            source: "steam",
            timestamp: new Date(),
        };
    },

    async fetchBulkPrices(items: string[]): Promise<Map<string, PriceData>> {
        const result = new Map<string, PriceData>();

        // Steam has no bulk endpoint — must fetch one at a time.
        // Very slow due to aggressive rate limiting (1 req per 3s).
        for (const marketHashName of items) {
            try {
                const priceData = await steamProvider.fetchItemPrice(marketHashName);
                result.set(marketHashName, priceData);
            } catch (error) {
                console.warn(
                    `[Steam] Failed to fetch price for "${marketHashName}":`,
                    error instanceof Error ? error.message : error
                );
            }
        }

        return result;
    },

    async fetchItemHistory(_marketHashName: string, _days: number): Promise<PricePoint[]> {
        // Steam Market doesn't expose a public price history API.
        // The price history chart data on Steam's website is loaded via
        // an authenticated endpoint that requires login cookies.
        // We rely on local snapshot accumulation instead.
        console.warn("[Steam] Price history not available via public API. Using local snapshots.");
        return [];
    },

    getRateLimitConfig(): RateLimitConfig {
        return {
            maxRequestsPerMinute: 20,
            maxRequestsPerDay: 500,
            minDelayMs: 3000,
        };
    },
};
