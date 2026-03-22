import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveMarketProvider } from "@/lib/market/registry";
import type { MarketSource } from "@/types";

interface SparklinePoint {
    time: number;
    value: number;
}

interface Mover {
    id: string;
    name: string;
    marketHashName: string;
    price: number;
    change24h: number;
    sparkline: SparklinePoint[];
}

interface TopMoversData {
    gainers: Mover[];
    losers: Mover[];
    updatedAt: string;
    source: string;
    cached?: boolean;
}

let memoryCache: TopMoversData | null = null;
let memoryCacheAt = 0;
const MEMORY_CACHE_MS = 5 * 60 * 1000;
const PERSISTENT_CACHE_TTL_MS = 60 * 60 * 1000;

async function loadCachedData(): Promise<TopMoversData | null> {
    try {
        const cached = await prisma.topMoversCache.findUnique({
            where: { id: "singleton" },
        });
        
        if (!cached) return null;
        
        return {
            gainers: JSON.parse(cached.gainers) as Mover[],
            losers: JSON.parse(cached.losers) as Mover[],
            updatedAt: cached.updatedAt.toISOString(),
            source: cached.source,
            cached: true,
        };
    } catch (error) {
        console.warn("[Top Movers] Failed to load cache:", error);
        return null;
    }
}

async function saveCachedData(data: TopMoversData): Promise<void> {
    try {
        await prisma.topMoversCache.upsert({
            where: { id: "singleton" },
            create: {
                id: "singleton",
                gainers: JSON.stringify(data.gainers),
                losers: JSON.stringify(data.losers),
                source: data.source,
                updatedAt: new Date(),
            },
            update: {
                gainers: JSON.stringify(data.gainers),
                losers: JSON.stringify(data.losers),
                source: data.source,
                updatedAt: new Date(),
            },
        });
    } catch (error) {
        console.warn("[Top Movers] Failed to save cache:", error);
    }
}

async function isCacheValid(): Promise<boolean> {
    try {
        const cached = await prisma.topMoversCache.findUnique({
            where: { id: "singleton" },
            select: { updatedAt: true },
        });
        
        if (!cached) return false;
        
        const age = Date.now() - cached.updatedAt.getTime();
        return age < PERSISTENT_CACHE_TTL_MS;
    } catch {
        return false;
    }
}

async function computeTopMovers(existingCache: TopMoversData | null): Promise<TopMoversData> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeSource: MarketSource = "csfloat";
    const provider = resolveMarketProvider(activeSource);

    let allPrices: Map<string, { price: number; source: string }> | null = null;
    let dataSource: string = activeSource;
    let providerFailed = false;
    
    if (provider) {
        try {
            const localItems = await prisma.item.findMany({
                where: { isActive: true },
                select: { marketHashName: true },
            });
            const itemNames = localItems.map((i) => i.marketHashName);
            const bulkResult = await provider.fetchBulkPrices(itemNames);
            allPrices = new Map(
                [...bulkResult.entries()].map(([k, v]) => [k, { price: v.price, source: v.source }])
            );
        } catch (error) {
            console.warn(`[Top Movers] Provider "${activeSource}" unavailable:`, error);
            providerFailed = true;
        }
    } else {
        console.warn(`[Top Movers] No provider for "${activeSource}"`);
        providerFailed = true;
    }

    if (providerFailed) {
        if (existingCache && existingCache.gainers.length > 0) {
            console.log("[Top Movers] Provider failed, returning cached data");
            return { ...existingCache, cached: true };
        }
        
        console.log("[Top Movers] No cache available, falling back to watchlist");
        dataSource = "watchlist";
    }

    if (dataSource === "watchlist") {
        const watchedItems = await prisma.item.findMany({
            where: { isWatched: true, isActive: true },
            include: {
                priceSnapshots: {
                    where: { timestamp: { gte: cutoff24h } },
                    orderBy: { timestamp: "desc" },
                },
            },
        });

        const movers: Mover[] = [];
        for (const item of watchedItems) {
            const snapshots = item.priceSnapshots;
            if (snapshots.length === 0) continue;

            const latest = snapshots[0];
            const earliest = snapshots[snapshots.length - 1];
            const price = latest.price;
            let change24h = 0;
            if (snapshots.length >= 2 && earliest.price > 0) {
                change24h = ((latest.price - earliest.price) / earliest.price) * 100;
            }

            const hourMap = new Map<number, { time: number; value: number }>();
            for (const snap of [...snapshots].reverse()) {
                const ts = snap.timestamp.getTime();
                const hourKey = Math.floor(ts / 3600000);
                if (!hourMap.has(hourKey)) {
                    hourMap.set(hourKey, { time: Math.floor(ts / 1000), value: snap.price });
                }
            }
            const sparkline = [...hourMap.values()].sort((a, b) => a.time - b.time).slice(-24);

            movers.push({
                id: item.id,
                name: item.name,
                marketHashName: item.marketHashName,
                price,
                change24h,
                sparkline,
            });
        }

        const gainers = movers.filter((m) => m.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 5);
        const losers = movers.filter((m) => m.change24h < 0).sort((a, b) => a.change24h - b.change24h).slice(0, 5);

        return { gainers, losers, updatedAt: now.toISOString(), source: dataSource };
    }

    const localItems = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true },
    });

    const localItemMap = new Map(localItems.map((item) => [item.marketHashName, item]));

    const snapshotsByHash = new Map<string, { price: number; timestamp: Date }[]>();
    for (const item of localItems) {
        const snapshots = await prisma.priceSnapshot.findMany({
            where: { itemId: item.id, timestamp: { gte: cutoff24h } },
            orderBy: { timestamp: "asc" },
            select: { price: true, timestamp: true },
        });
        if (snapshots.length >= 1) {
            snapshotsByHash.set(item.marketHashName, snapshots);
        }
    }

    const movers: Mover[] = [];

    for (const [marketHashName, priceData] of allPrices!) {
        if (priceData.price <= 0) continue;

        const localItem = localItemMap.get(marketHashName);
        const snapshots = snapshotsByHash.get(marketHashName);

        let change24h = 0;
        let sparkline: SparklinePoint[] = [];

        if (snapshots && snapshots.length >= 2) {
            const earliest = snapshots[0];
            const latest = snapshots[snapshots.length - 1];

            if (earliest.price > 0) {
                change24h = ((latest.price - earliest.price) / earliest.price) * 100;
            }

            const hourMap = new Map<number, { time: number; value: number }>();
            for (const snap of snapshots) {
                const ts = snap.timestamp.getTime();
                const hourKey = Math.floor(ts / 3600000);
                if (!hourMap.has(hourKey)) {
                    hourMap.set(hourKey, { time: Math.floor(ts / 1000), value: snap.price });
                }
            }

            sparkline = [...hourMap.values()].sort((a, b) => a.time - b.time).slice(-24);
        }

        if (!snapshots || snapshots.length === 0) continue;

        movers.push({
            id: localItem?.id ?? marketHashName,
            name: localItem?.name ?? marketHashName,
            marketHashName,
            price: priceData.price,
            change24h,
            sparkline,
        });
    }

    const gainers = movers.filter((m) => m.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 5);
    const losers = movers.filter((m) => m.change24h < 0).sort((a, b) => a.change24h - b.change24h).slice(0, 5);

    return { gainers, losers, updatedAt: now.toISOString(), source: dataSource };
}

export async function GET() {
    try {
        if (memoryCache && Date.now() - memoryCacheAt < MEMORY_CACHE_MS) {
            return NextResponse.json({ success: true, data: memoryCache });
        }

        const cacheValid = await isCacheValid();
        const existingCache = await loadCachedData();
        
        if (cacheValid && existingCache) {
            memoryCache = existingCache;
            memoryCacheAt = Date.now();
            return NextResponse.json({ success: true, data: existingCache });
        }

        const data = await computeTopMovers(existingCache);
        
        if (data.source !== "watchlist" && !data.cached) {
            await saveCachedData(data);
        }

        memoryCache = data;
        memoryCacheAt = Date.now();

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("[API /market/top-movers]", error);
        
        const fallbackCache = await loadCachedData();
        if (fallbackCache) {
            return NextResponse.json({ success: true, data: fallbackCache });
        }
        
        return NextResponse.json(
            { success: false, error: "Failed to compute top movers" },
            { status: 500 }
        );
    }
}

export { computeTopMovers };
export type { TopMoversData, Mover, SparklinePoint };

export function __resetCache() {
    memoryCache = null;
    memoryCacheAt = 0;
}
