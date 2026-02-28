import type { CSGOTraderSubProvider, MarketDataProvider, PriceData, RateLimitConfig } from "@/types";
import { csgotraderQueue } from "@/lib/api-queue";
import { prisma } from "@/lib/db";
import {
    parseKeyValueFormat,
    parseMultiModeFormat,
    parseSimplePriceFormat,
    PROVIDER_FORMAT_MAP,
} from "@/lib/market/csgotrader-parsers";

const BASE_URL = "https://prices.csgotrader.app/latest";

let cachedPrices: Map<string, number> | null = null;
let cacheTimestamp = 0;
let cachedSubProvider: string | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function getSubProvider(): Promise<CSGOTraderSubProvider> {
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    const typedSettings = settings as { csgotraderSubProvider?: CSGOTraderSubProvider } | null;
    return typedSettings?.csgotraderSubProvider ?? "csfloat";
}

function parseProviderData(
    data: unknown,
    subProvider: CSGOTraderSubProvider
): Map<string, number> {
    const config = PROVIDER_FORMAT_MAP[subProvider];

    if (config.parser === "simple") {
        return parseSimplePriceFormat(data as Record<string, { price: number | null }>);
    }

    if (config.parser === "keyvalue") {
        return parseKeyValueFormat(data as Record<string, number>);
    }

    if (!config.defaultMode) {
        throw new Error(`CSGOTrader parser config missing defaultMode for ${subProvider}`);
    }

    return parseMultiModeFormat(data as Record<string, unknown>, config.defaultMode);
}

async function fetchPricesForSubProvider(
    subProvider: CSGOTraderSubProvider
): Promise<Map<string, number>> {
    const data = await csgotraderQueue.enqueue(async () => {
        const res = await fetch(`${BASE_URL}/${subProvider}.json`);
        if (!res.ok) {
            throw new Error(`CSGOTrader API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<unknown>;
    });

    return parseProviderData(data, subProvider);
}

async function getCachedPrices(
    subProvider: CSGOTraderSubProvider
): Promise<Map<string, number>> {
    const now = Date.now();
    const isExpired = now - cacheTimestamp > CACHE_TTL_MS;
    const isDifferentProvider = cachedSubProvider !== subProvider;

    if (!cachedPrices || isExpired || isDifferentProvider) {
        cachedPrices = await fetchPricesForSubProvider(subProvider);
        cacheTimestamp = now;
        cachedSubProvider = subProvider;
    }

    return cachedPrices;
}

export const csgotraderProvider: MarketDataProvider = {
    name: "csgotrader",

    async fetchItemPrice(marketHashName: string): Promise<PriceData> {
        const subProvider = await getSubProvider();
        const prices = await getCachedPrices(subProvider);
        const price = prices.get(marketHashName);

        if (!price) {
            throw new Error(`No CSGOTrader price found for "${marketHashName}"`);
        }

        return {
            price,
            source: subProvider,
            timestamp: new Date(),
        };
    },

    async fetchBulkPrices(items: string[]): Promise<Map<string, PriceData>> {
        const result = new Map<string, PriceData>();
        const subProvider = await getSubProvider();
        const prices = await getCachedPrices(subProvider);

        for (const marketHashName of items) {
            const price = prices.get(marketHashName);
            if (price) {
                result.set(marketHashName, {
                    price,
                    source: subProvider,
                    timestamp: new Date(),
                });
            }
        }

        return result;
    },

    getRateLimitConfig(): RateLimitConfig {
        return {
            maxRequestsPerMinute: 12,
            maxRequestsPerDay: 1000,
            minDelayMs: 5000,
        };
    },
};
