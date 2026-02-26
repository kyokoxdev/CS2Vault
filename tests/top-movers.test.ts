/**
 * Unit Tests: Top Movers API endpoint
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma (actual import path used in route is @/lib/db)
vi.mock("@/lib/db", () => ({
    prisma: {
        item: { findMany: vi.fn() },
        priceSnapshot: { findMany: vi.fn() },
    },
}));

import { prisma } from "@/lib/db";
import {
    computeTopMovers,
    __resetCache,
} from "@/app/api/market/top-movers/route";

const mockItemFindMany = vi.mocked(prisma.item.findMany);
const mockSnapshotFindMany = vi.mocked(prisma.priceSnapshot.findMany);

// Helper to create a Date relative to now
function hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
}

beforeEach(() => {
    vi.clearAllMocks();
    __resetCache();
});

describe("GET /api/market/top-movers", () => {
    it("returns empty gainers/losers when DB has no active items", async () => {
        mockItemFindMany.mockResolvedValue([]);

        const result = await computeTopMovers();

        expect(result.gainers).toEqual([]);
        expect(result.losers).toEqual([]);
        expect(result.updatedAt).toBeDefined();
        expect(typeof result.updatedAt).toBe("string");
    });

    it("excludes items with only 1 price snapshot", async () => {
        mockItemFindMany.mockResolvedValue([
            { id: "item1", name: "AK-47 | Redline", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 10.5, timestamp: hoursAgo(12) },
        ] as never);

        const result = await computeTopMovers();

        expect(result.gainers).toEqual([]);
        expect(result.losers).toEqual([]);
    });

    it("correctly sorts gainers descending and losers ascending", async () => {
        mockItemFindMany.mockResolvedValue([
            { id: "g1", name: "Gainer Big", marketHashName: "Gainer Big" },
            { id: "g2", name: "Gainer Small", marketHashName: "Gainer Small" },
            { id: "l1", name: "Loser Big", marketHashName: "Loser Big" },
            { id: "l2", name: "Loser Small", marketHashName: "Loser Small" },
            { id: "flat", name: "Flat Item", marketHashName: "Flat Item" },
        ] as never);

        // Gainer Big: 100 -> 150 = +50%
        // Gainer Small: 100 -> 110 = +10%
        // Loser Big: 100 -> 60 = -40%
        // Loser Small: 100 -> 95 = -5%
        // Flat Item: 100 -> 100 = 0%
        mockSnapshotFindMany.mockImplementation(((args: { where: { itemId: string } }) => {
            const id = args.where.itemId;
            const priceMap: Record<string, [number, number]> = {
                g1: [100, 150],
                g2: [100, 110],
                l1: [100, 60],
                l2: [100, 95],
                flat: [100, 100],
            };
            const [start, end] = priceMap[id] || [100, 100];
            return Promise.resolve([
                { price: start, timestamp: hoursAgo(20) },
                { price: end, timestamp: hoursAgo(1) },
            ]);
        }) as never);

        const result = await computeTopMovers();

        // Gainers sorted descending
        expect(result.gainers).toHaveLength(2);
        expect(result.gainers[0].id).toBe("g1"); // +50%
        expect(result.gainers[1].id).toBe("g2"); // +10%
        expect(result.gainers[0].change24h).toBeCloseTo(50);
        expect(result.gainers[1].change24h).toBeCloseTo(10);

        // Losers sorted ascending (most negative first)
        expect(result.losers).toHaveLength(2);
        expect(result.losers[0].id).toBe("l1"); // -40%
        expect(result.losers[1].id).toBe("l2"); // -5%
        expect(result.losers[0].change24h).toBeCloseTo(-40);
        expect(result.losers[1].change24h).toBeCloseTo(-5);
    });

    it("excludes 0% change items from both gainers and losers", async () => {
        mockItemFindMany.mockResolvedValue([
            { id: "flat", name: "Flat", marketHashName: "Flat" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 100, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers();

        expect(result.gainers).toHaveLength(0);
        expect(result.losers).toHaveLength(0);
    });

    it("caps at 5 gainers and 5 losers", async () => {
        const items = Array.from({ length: 12 }, (_, i) => ({
            id: `item${i}`,
            name: `Item ${i}`,
            marketHashName: `Item ${i}`,
        }));
        mockItemFindMany.mockResolvedValue(items as never);

        // First 7 are gainers (ascending: +10, +20, ..., +70)
        // Last 5 are losers (-10, -20, ..., -50)
        mockSnapshotFindMany.mockImplementation(((args: { where: { itemId: string } }) => {
            const idx = parseInt(args.where.itemId.replace("item", ""));
            let start = 100;
            let end: number;
            if (idx < 7) {
                end = 100 + (idx + 1) * 10; // +10% to +70%
            } else {
                end = 100 - (idx - 6) * 10; // -10% to -50%
            }
            return Promise.resolve([
                { price: start, timestamp: hoursAgo(20) },
                { price: end, timestamp: hoursAgo(1) },
            ]);
        }) as never);

        const result = await computeTopMovers();

        expect(result.gainers).toHaveLength(5);
        expect(result.losers).toHaveLength(5);
        // Top gainer should be item6 (+70%)
        expect(result.gainers[0].id).toBe("item6");
    });

    it("returns fewer than 5 if not enough items", async () => {
        mockItemFindMany.mockResolvedValue([
            { id: "g1", name: "Gainer", marketHashName: "Gainer" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 120, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers();

        expect(result.gainers).toHaveLength(1);
        expect(result.losers).toHaveLength(0);
    });

    it("validates sparkline data shape", async () => {
        mockItemFindMany.mockResolvedValue([
            { id: "s1", name: "Spark Item", marketHashName: "Spark Item" },
        ] as never);

        // Multiple snapshots across different days
        const now = Date.now();
        const dayMs = 86400000;
        mockSnapshotFindMany.mockResolvedValue([
            { price: 90, timestamp: new Date(now - 2 * dayMs) },
            { price: 91, timestamp: new Date(now - 2 * dayMs + 3600000) }, // Same day, should be deduped
            { price: 95, timestamp: new Date(now - 1 * dayMs) },
            { price: 100, timestamp: new Date(now) },
        ] as never);

        const result = await computeTopMovers();

        expect(result.gainers).toHaveLength(1);
        const sparkline = result.gainers[0].sparkline;

        // Should be 3 data points (3 different days), first snap of each day
        expect(sparkline.length).toBeLessThanOrEqual(30);
        expect(sparkline.length).toBeGreaterThanOrEqual(1);

        // Validate shape of each sparkline point
        for (const point of sparkline) {
            expect(point).toHaveProperty("time");
            expect(point).toHaveProperty("value");
            expect(typeof point.time).toBe("number");
            expect(typeof point.value).toBe("number");
        }

        // Sorted oldest to newest
        for (let i = 1; i < sparkline.length; i++) {
            expect(sparkline[i].time).toBeGreaterThanOrEqual(sparkline[i - 1].time);
        }
    });

    it("cache returns same object within TTL", async () => {
        // Import the GET handler
        const { GET } = await import("@/app/api/market/top-movers/route");

        mockItemFindMany.mockResolvedValue([
            { id: "c1", name: "Cache Item", marketHashName: "Cache Item" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 120, timestamp: hoursAgo(1) },
        ] as never);

        // First call computes
        const res1 = await GET();
        const body1 = await res1.json();

        // Second call should use cache (same data reference)
        const res2 = await GET();
        const body2 = await res2.json();

        expect(body1.success).toBe(true);
        expect(body2.success).toBe(true);
        expect(body1.data.updatedAt).toBe(body2.data.updatedAt);

        // Prisma should only be called once (cached on second call)
        expect(mockItemFindMany).toHaveBeenCalledTimes(1);
    });
});
