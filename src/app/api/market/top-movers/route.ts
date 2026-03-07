/**
 * GET /api/market/top-movers — Top 5 gainers and losers with sparkline data
 */

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
}

let cachedData: TopMoversData | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function computeTopMovers(): Promise<TopMoversData> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Always use CSFloat for top movers
    const activeSource: MarketSource = "csfloat";
    const provider = resolveMarketProvider(activeSource);

    let allPrices: Map<string, { price: number; source: string }> | null = null;
    let dataSource: string = activeSource;
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
            console.warn(
                `[Top Movers] Provider "${activeSource}" unavailable, falling back to watchlist:`,
                error
            );
            allPrices = null;
            dataSource = "watchlist";
        }
    } else {
        console.warn(`[Top Movers] No provider for "${activeSource}", using watchlist fallback`);
        dataSource = "watchlist";
    }

    // 2. Watchlist fallback path
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
                change24h =
                    ((latest.price - earliest.price) / earliest.price) * 100;
            }

            // Build sparkline from ascending order
            const hourMap = new Map<number, { time: number; value: number }>();
            for (const snap of [...snapshots].reverse()) {
                const ts = snap.timestamp.getTime();
                const hourKey = Math.floor(ts / 3600000);
                if (!hourMap.has(hourKey)) {
                    hourMap.set(hourKey, {
                        time: Math.floor(ts / 1000),
                        value: snap.price,
                    });
                }
            }
            const sparkline = [...hourMap.values()]
                .sort((a, b) => a.time - b.time)
                .slice(-24);

            movers.push({
                id: item.id,
                name: item.name,
                marketHashName: item.marketHashName,
                price,
                change24h,
                sparkline,
            });
        }

        const gainers = movers
            .filter((m) => m.change24h > 0)
            .sort((a, b) => b.change24h - a.change24h)
            .slice(0, 5);

        const losers = movers
            .filter((m) => m.change24h < 0)
            .sort((a, b) => a.change24h - b.change24h)
            .slice(0, 5);

        return {
            gainers,
            losers,
            updatedAt: now.toISOString(),
            source: dataSource,
        };
    }

    // 3. Provider path — get local items for 24h change calculation
    const localItems = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true },
    });

    // Build a lookup: marketHashName -> local item info
    const localItemMap = new Map(
        localItems.map((item) => [item.marketHashName, item])
    );

    // 4. For local items, fetch 24h snapshots for change calculation + sparkline
    const snapshotsByHash = new Map<
        string,
        { price: number; timestamp: Date }[]
    >();
    for (const item of localItems) {
        const snapshots = await prisma.priceSnapshot.findMany({
            where: {
                itemId: item.id,
                timestamp: { gte: cutoff24h },
            },
            orderBy: { timestamp: "asc" },
            select: { price: true, timestamp: true },
        });
        if (snapshots.length >= 1) {
            snapshotsByHash.set(item.marketHashName, snapshots);
        }
    }

    // 5. Build movers from ALL provider items
    const movers: Mover[] = [];

    for (const [marketHashName, priceData] of allPrices!) {
        if (priceData.price <= 0) continue;

        const localItem = localItemMap.get(marketHashName);
        const snapshots = snapshotsByHash.get(marketHashName);

        let change24h = 0;
        let sparkline: SparklinePoint[] = [];

        if (snapshots && snapshots.length >= 2) {
            // Has local history — compute real 24h change
            const earliest = snapshots[0];
            const latest = snapshots[snapshots.length - 1];

            if (earliest.price > 0) {
                change24h =
                    ((latest.price - earliest.price) / earliest.price) * 100;
            }

            // Build sparkline: hourly data points (from Task 2 logic)
            const hourMap = new Map<number, { time: number; value: number }>();
            for (const snap of snapshots) {
                const ts = snap.timestamp.getTime();
                const hourKey = Math.floor(ts / 3600000);
                if (!hourMap.has(hourKey)) {
                    hourMap.set(hourKey, {
                        time: Math.floor(ts / 1000),
                        value: snap.price,
                    });
                }
            }

            sparkline = [...hourMap.values()]
                .sort((a, b) => a.time - b.time)
                .slice(-24);
        }

        // Include items with at least 1 snapshot
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

    // Sort: Gainers descending, Losers ascending
    const gainers = movers
        .filter((m) => m.change24h > 0)
        .sort((a, b) => b.change24h - a.change24h)
        .slice(0, 5);

    const losers = movers
        .filter((m) => m.change24h < 0)
        .sort((a, b) => a.change24h - b.change24h)
        .slice(0, 5);

    return {
        gainers,
        losers,
        updatedAt: now.toISOString(),
        source: dataSource,
    };
}

export async function GET() {
    try {
        if (cachedData && Date.now() - cachedAt < CACHE_MS) {
            return NextResponse.json({ success: true, data: cachedData });
        }

        const data = await computeTopMovers();
        cachedData = data;
        cachedAt = Date.now();

        return NextResponse.json({ success: true, data: cachedData });
    } catch (error) {
        console.error("[API /market/top-movers]", error);
        return NextResponse.json(
            { success: false, error: "Failed to compute top movers" },
            { status: 500 }
        );
    }
}

// Export for testing purposes
export { computeTopMovers };
export type { TopMoversData, Mover, SparklinePoint };

// Reset cache (for testing)
export function __resetCache() {
    cachedData = null;
    cachedAt = 0;
}
