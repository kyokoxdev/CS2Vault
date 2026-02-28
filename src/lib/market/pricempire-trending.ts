import { prisma } from "@/lib/db";

const TRENDING_URL = "https://pricempire.com/api-data/v1/trending";

interface TrendingItem {
    marketHashName: string;
    price: number;
    change24h?: number;
    volume?: number;
}

interface MarketCapData {
    totalMarketCap: number;
    totalListings: number;
    topItems: TrendingItem[];
    timestamp: Date;
    provider: string;
}

let cachedData: MarketCapData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchMarketCapData(): Promise<MarketCapData | null> {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedData;
    }

    try {
        const url = new URL(TRENDING_URL);
        url.searchParams.set("sort", "current");
        url.searchParams.set("order", "DESC");
        url.searchParams.set("chart", "true");
        url.searchParams.set("provider", "youpin");
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", "50");

        const res = await fetch(url.toString());
        if (!res.ok) {
            console.warn(`[Pricempire Trending] Fetch failed: ${res.status} ${res.statusText}`);
            return cachedData;
        }

        const json = await res.json();

        const items: unknown[] = Array.isArray(json) ? json : (json?.data ?? json?.items ?? []);

        const topItems: TrendingItem[] = [];
        let totalMarketCap = 0;

        for (const raw of items) {
            if (!raw || typeof raw !== "object") continue;
            const item = raw as Record<string, unknown>;
            
            const marketHashName = (item.marketHashName ?? item.market_hash_name ?? item.name) as string | undefined;
            const price = Number(item.price ?? item.current ?? 0);
            const change24h = item.change24h !== undefined ? Number(item.change24h) : undefined;
            const volume = item.volume !== undefined ? Number(item.volume) : undefined;

            if (marketHashName && price > 0) {
                topItems.push({ marketHashName, price, change24h, volume });
                totalMarketCap += price * (volume ?? 1);
            }
        }

        const data: MarketCapData = {
            totalMarketCap,
            totalListings: topItems.length,
            topItems,
            timestamp: new Date(),
            provider: "youpin",
        };

        await prisma.marketCapSnapshot.create({
            data: {
                totalMarketCap: data.totalMarketCap,
                totalListings: data.totalListings,
                provider: data.provider,
                topItems: JSON.stringify(data.topItems),
                timestamp: data.timestamp,
            },
        });

        cachedData = data;
        cacheTimestamp = now;
        return data;
    } catch (error) {
        console.warn("[Pricempire Trending] Error fetching market cap data:", error instanceof Error ? error.message : error);
        return cachedData;
    }
}

export async function cleanupOldSnapshots(daysToKeep = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await prisma.marketCapSnapshot.deleteMany({
        where: { timestamp: { lt: cutoff } },
    });
    return result.count;
}
