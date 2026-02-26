/**
 * GET /api/market/top-movers — Top 5 gainers and losers with sparkline data
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
const CACHE_MS = 2 * 60 * 1000;

async function computeTopMovers(): Promise<TopMoversData> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all active items
    const items = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true },
    });

    const movers: Mover[] = [];

    for (const item of items) {
        // Get snapshots from last 24h ordered by timestamp ascending
        const snapshots = await prisma.priceSnapshot.findMany({
            where: {
                itemId: item.id,
                timestamp: { gte: cutoff24h },
            },
            orderBy: { timestamp: "asc" },
            select: { price: true, timestamp: true },
        });

        // Skip items with only 1 snapshot (can't compute change)
        if (snapshots.length < 2) continue;

        const earliest = snapshots[0];
        const latest = snapshots[snapshots.length - 1];

        if (earliest.price === 0) continue;

        const change24h =
            ((latest.price - earliest.price) / earliest.price) * 100;

        // Build sparkline: up to 30 daily data points
        // Group by day using floor(timestamp/86400000)
        const dayMap = new Map<number, { time: number; value: number }>();
        for (const snap of snapshots) {
            const ts = snap.timestamp.getTime();
            const dayKey = Math.floor(ts / 86400000);
            // Take first snapshot of each day
            if (!dayMap.has(dayKey)) {
                dayMap.set(dayKey, {
                    time: Math.floor(ts / 1000),
                    value: snap.price,
                });
            }
        }

        const sparkline = [...dayMap.values()]
            .sort((a, b) => a.time - b.time)
            .slice(-30); // Keep most recent 30

        movers.push({
            id: item.id,
            name: item.name,
            marketHashName: item.marketHashName,
            price: latest.price,
            change24h,
            sparkline,
        });
    }

    // Sort: 0% change items rank last
    // Gainers: descending by change24h (positive changes first)
    const gainers = movers
        .filter((m) => m.change24h > 0)
        .sort((a, b) => b.change24h - a.change24h)
        .slice(0, 5);

    // Losers: ascending by change24h (most negative first)
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
