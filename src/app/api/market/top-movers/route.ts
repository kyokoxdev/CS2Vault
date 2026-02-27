/**
 * GET /api/market/top-movers — Top 5 gainers and losers with sparkline data
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllPrices } from "@/lib/market/pricempire";

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
}

let cachedData: TopMoversData | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function computeTopMovers(): Promise<TopMoversData> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Fetch ALL market prices from Pricempire
    const allPrices = await fetchAllPrices();

    // 2. Get local items that have price snapshots (for 24h change calculation)
    const localItems = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true },
    });

    // Build a lookup: marketHashName -> local item info
    const localItemMap = new Map(
        localItems.map((item) => [item.marketHashName, item])
    );

    // 3. For local items, fetch 24h snapshots for change calculation + sparkline
    const snapshotsByHash = new Map<string, { price: number; timestamp: Date }[]>();
    for (const item of localItems) {
        const snapshots = await prisma.priceSnapshot.findMany({
            where: {
                itemId: item.id,
                timestamp: { gte: cutoff24h },
            },
            orderBy: { timestamp: "asc" },
            select: { price: true, timestamp: true },
        });
        if (snapshots.length >= 2) {
            snapshotsByHash.set(item.marketHashName, snapshots);
        }
    }

    // 4. Build movers from ALL Pricempire items
    const movers: Mover[] = [];

    for (const [marketHashName, priceData] of allPrices) {
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

        // Only include items that have a meaningful change (skip zero-change items without history)
        if (change24h === 0 && !snapshots) continue;

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
