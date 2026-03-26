/**
 * Unit Tests: Top Movers API endpoint
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma (actual import path used in route is @/lib/db)
vi.mock("@/lib/db", () => ({
    prisma: {
        item: { findMany: vi.fn() },
        priceSnapshot: { findMany: vi.fn() },
        appSettings: { findUnique: vi.fn() },
        topMoversCache: { findUnique: vi.fn(), upsert: vi.fn() },
    },
}));

// Mock registry (resolveMarketProvider returns provider or null)
vi.mock("@/lib/market/registry", () => ({
    resolveMarketProvider: vi.fn(),
}));

vi.mock("@/lib/market/init", () => ({
    initializeMarketProviders: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { initializeMarketProviders } from "@/lib/market/init";
import { resolveMarketProvider } from "@/lib/market/registry";
import {
    computeTopMovers,
    __resetCache,
} from "@/app/api/market/top-movers/route";

const mockItemFindMany = vi.mocked(prisma.item.findMany);
const mockSnapshotFindMany = vi.mocked(prisma.priceSnapshot.findMany);
const mockAppSettingsFindUnique = vi.mocked(prisma.appSettings.findUnique);
const mockTopMoversCacheFindUnique = vi.mocked(prisma.topMoversCache.findUnique);
const mockResolveMarketProvider = vi.mocked(resolveMarketProvider);
const mockInitializeMarketProviders = vi.mocked(initializeMarketProviders);

// Helper to create a Date relative to now
function hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
}

// Helper to create a price map (simulates provider bulk response)
function makePriceMap(
    items: Array<{ name: string; price?: number }>
): Map<string, { price: number; source: string; timestamp: Date }> {
    const map = new Map<string, { price: number; source: string; timestamp: Date }>();
    for (const item of items) {
        map.set(item.name, {
            price: item.price ?? 100,
            source: "csfloat",
            timestamp: new Date(),
        });
    }
    return map;
}

// Helper to create a mock provider with fetchBulkPrices
function makeMockProvider(priceMap: Map<string, { price: number; source: string; timestamp: Date }>) {
    return {
        fetchBulkPrices: vi.fn().mockResolvedValue(priceMap),
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    __resetCache();
    mockInitializeMarketProviders.mockResolvedValue(undefined);
    mockAppSettingsFindUnique.mockResolvedValue({
        id: "singleton",
        activeMarketSource: "csfloat",
        csgotraderSubProvider: "csfloat",
    } as never);
    mockTopMoversCacheFindUnique.mockResolvedValue(null);
});

describe("GET /api/market/top-movers", () => {
    it("returns empty gainers/losers when DB has no active items", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(new Map()) as never);
        mockItemFindMany.mockResolvedValue([]);

        const result = await computeTopMovers(null);

        expect(result.gainers).toEqual([]);
        expect(result.losers).toEqual([]);
        expect(result.updatedAt).toBeDefined();
        expect(typeof result.updatedAt).toBe("string");
    });

    it("excludes items with only 1 price snapshot", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "AK-47 | Redline (Field-Tested)" },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "item1", name: "AK-47 | Redline", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 10.5, timestamp: hoursAgo(12) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.gainers).toEqual([]);
        expect(result.losers).toEqual([]);
    });

    it("correctly sorts gainers descending and losers ascending", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Gainer Big" },
            { name: "Gainer Small" },
            { name: "Loser Big" },
            { name: "Loser Small" },
            { name: "Flat Item" },
        ])) as never);
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

        const result = await computeTopMovers(null);

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
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Flat" },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "flat", name: "Flat", marketHashName: "Flat" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 100, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.gainers).toHaveLength(0);
        expect(result.losers).toHaveLength(0);
    });

    it("caps at 5 gainers and 5 losers", async () => {
        const items = Array.from({ length: 12 }, (_, i) => ({
            id: `item${i}`,
            name: `Item ${i}`,
            marketHashName: `Item ${i}`,
        }));
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap(
            items.map((item) => ({ name: item.marketHashName }))
        )) as never);
        mockItemFindMany.mockResolvedValue(items as never);

        // First 7 are gainers (ascending: +10, +20, ..., +70)
        // Last 5 are losers (-10, -20, ..., -50)
        mockSnapshotFindMany.mockImplementation(((args: { where: { itemId: string } }) => {
            const idx = parseInt(args.where.itemId.replace("item", ""));
            const start = 100;
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

        const result = await computeTopMovers(null);

        expect(result.gainers).toHaveLength(5);
        expect(result.losers).toHaveLength(5);
        // Top gainer should be item6 (+70%)
        expect(result.gainers[0].id).toBe("item6");
    });

    it("returns fewer than 5 if not enough items", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Gainer" },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "g1", name: "Gainer", marketHashName: "Gainer" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 120, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.gainers).toHaveLength(1);
        expect(result.losers).toHaveLength(0);
    });

    it("validates sparkline data shape", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Spark Item" },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "s1", name: "Spark Item", marketHashName: "Spark Item" },
        ] as never);

        // Multiple snapshots across different hours
        const now = Date.now();
        const dayMs = 86400000;
        mockSnapshotFindMany.mockResolvedValue([
            { price: 90, timestamp: new Date(now - 2 * dayMs) },
            { price: 91, timestamp: new Date(now - 2 * dayMs + 3600000) }, // Different hour key, not deduped
            { price: 95, timestamp: new Date(now - 1 * dayMs) },
            { price: 100, timestamp: new Date(now) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.gainers).toHaveLength(1);
        const sparkline = result.gainers[0].sparkline;

        // Hourly grouping: 4 unique hours → up to 4 data points, capped at 24
        expect(sparkline.length).toBeLessThanOrEqual(24);
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

        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Cache Item" },
        ])) as never);
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

        expect(mockAppSettingsFindUnique).toHaveBeenCalledTimes(2);
    });

    it("recomputes movers when active market source changes even within cache TTL", async () => {
        const { GET } = await import("@/app/api/market/top-movers/route");

        mockAppSettingsFindUnique
            .mockResolvedValueOnce({
                id: "singleton",
                activeMarketSource: "csfloat",
                csgotraderSubProvider: "csfloat",
            } as never)
            .mockResolvedValueOnce({
                id: "singleton",
                activeMarketSource: "steam",
                csgotraderSubProvider: "csfloat",
            } as never)
            .mockResolvedValueOnce({
                id: "singleton",
                activeMarketSource: "steam",
                csgotraderSubProvider: "csfloat",
            } as never);

        mockItemFindMany
            .mockResolvedValueOnce([{ marketHashName: "CSFloat Item" }] as never)
            .mockResolvedValueOnce([{ id: "cf-1", name: "CSFloat Item", marketHashName: "CSFloat Item" }] as never)
            .mockResolvedValueOnce([{ marketHashName: "Steam Item" }] as never)
            .mockResolvedValueOnce([{ id: "st-1", name: "Steam Item", marketHashName: "Steam Item" }] as never);

        mockSnapshotFindMany
            .mockResolvedValueOnce([
                { price: 100, timestamp: hoursAgo(20) },
                { price: 120, timestamp: hoursAgo(1) },
            ] as never)
            .mockResolvedValueOnce([
                { price: 90, timestamp: hoursAgo(20) },
                { price: 130, timestamp: hoursAgo(1) },
            ] as never);

        mockResolveMarketProvider
            .mockReturnValueOnce(makeMockProvider(makePriceMap([
                { name: "CSFloat Item", price: 120 },
            ])) as never)
            .mockReturnValueOnce(makeMockProvider(new Map([
                ["Steam Item", { price: 130, source: "steam", timestamp: new Date() }],
            ])) as never);

        const firstResponse = await GET();
        const firstBody = await firstResponse.json();
        expect(firstBody.success).toBe(true);
        expect(firstBody.data.source).toBe("csfloat");
        expect(firstBody.data.gainers[0].id).toBe("cf-1");

        const secondResponse = await GET();
        const secondBody = await secondResponse.json();
        expect(secondBody.success).toBe(true);
        expect(secondBody.data.source).toBe("steam");
        expect(secondBody.data.gainers[0].id).toBe("st-1");
        expect(mockResolveMarketProvider).toHaveBeenNthCalledWith(1, "csfloat");
        expect(mockResolveMarketProvider).toHaveBeenNthCalledWith(2, "steam");
    });

    it("normal path returns source 'csfloat'", async () => {
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "AK-47 | Redline (Field-Tested)", price: 120 },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "item1", name: "AK-47 | Redline", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 120, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.source).toBe("csfloat");
        expect(result.gainers).toHaveLength(1);
    });

    it("initializes providers and uses configured active market source", async () => {
        mockAppSettingsFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "steam",
            csgotraderSubProvider: "csfloat",
        } as never);
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Steam Item", price: 150 },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "s1", name: "Steam Item", marketHashName: "Steam Item" },
        ] as never);
        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 150, timestamp: hoursAgo(1) },
        ] as never);

        const result = await computeTopMovers(null);

        expect(mockInitializeMarketProviders).toHaveBeenCalledTimes(1);
        expect(mockResolveMarketProvider).toHaveBeenCalledWith("steam");
        expect(result.source).toBe("steam");
        expect(result.gainers).toHaveLength(1);
    });

    it("fallback returns source 'watchlist' when provider is null", async () => {
        mockResolveMarketProvider.mockReturnValue(null);
        mockItemFindMany.mockResolvedValue([
            {
                id: "w1",
                name: "AWP | Asiimov",
                marketHashName: "AWP | Asiimov (Field-Tested)",
                isWatched: true,
                isActive: true,
                priceSnapshots: [
                    { price: 130, timestamp: hoursAgo(1) },
                    { price: 100, timestamp: hoursAgo(20) },
                ],
            },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.source).toBe("watchlist");
        expect(result.updatedAt).toBeDefined();
        expect(result.gainers).toHaveLength(1);
        expect(result.gainers[0].id).toBe("w1");
        expect(result.gainers[0].name).toBe("AWP | Asiimov");
    });

    it("fallback computes valid gainers/losers from watchlist data", async () => {
        mockResolveMarketProvider.mockReturnValue(null);
        mockItemFindMany.mockResolvedValue([
            {
                id: "wg1",
                name: "Gainer Watch",
                marketHashName: "Gainer Watch (FT)",
                isWatched: true,
                isActive: true,
                priceSnapshots: [
                    { price: 150, timestamp: hoursAgo(1) },
                    { price: 100, timestamp: hoursAgo(20) },
                ],
            },
            {
                id: "wl1",
                name: "Loser Watch",
                marketHashName: "Loser Watch (FT)",
                isWatched: true,
                isActive: true,
                priceSnapshots: [
                    { price: 60, timestamp: hoursAgo(1) },
                    { price: 100, timestamp: hoursAgo(20) },
                ],
            },
            {
                id: "wf1",
                name: "Flat Watch",
                marketHashName: "Flat Watch (FT)",
                isWatched: true,
                isActive: true,
                priceSnapshots: [
                    { price: 100, timestamp: hoursAgo(1) },
                    { price: 100, timestamp: hoursAgo(20) },
                ],
            },
        ] as never);

        const result = await computeTopMovers(null);

        expect(result.source).toBe("watchlist");
        // Gainer: 100 -> 150 = +50%
        expect(result.gainers).toHaveLength(1);
        expect(result.gainers[0].id).toBe("wg1");
        expect(result.gainers[0].change24h).toBeCloseTo(50);
        expect(result.gainers[0].price).toBe(150);
        // Loser: 100 -> 60 = -40%
        expect(result.losers).toHaveLength(1);
        expect(result.losers[0].id).toBe("wl1");
        expect(result.losers[0].change24h).toBeCloseTo(-40);
        expect(result.losers[0].price).toBe(60);
    });

    it("fallback with empty watchlist returns empty arrays", async () => {
        mockResolveMarketProvider.mockReturnValue(null);
        mockItemFindMany.mockResolvedValue([] as never);

        const result = await computeTopMovers(null);

        expect(result.source).toBe("watchlist");
        expect(result.gainers).toEqual([]);
        expect(result.losers).toEqual([]);
    });

    it("does not reuse watchlist fallback from memory cache after provider recovery", async () => {
        const { GET } = await import("@/app/api/market/top-movers/route");

        mockItemFindMany
            .mockResolvedValueOnce([
                {
                    id: "w1",
                    name: "Watch Item",
                    marketHashName: "Watch Item",
                    isWatched: true,
                    isActive: true,
                    priceSnapshots: [
                        { price: 120, timestamp: hoursAgo(1) },
                        { price: 100, timestamp: hoursAgo(20) },
                    ],
                },
            ] as never)
            .mockResolvedValueOnce([
                { id: "m1", name: "Market Item", marketHashName: "Market Item" },
            ] as never)
            .mockResolvedValueOnce([
                { id: "m1", name: "Market Item", marketHashName: "Market Item" },
            ] as never);

        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 150, timestamp: hoursAgo(1) },
        ] as never);

        mockResolveMarketProvider
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(makeMockProvider(makePriceMap([
                { name: "Market Item", price: 150 },
            ])) as never);

        const fallbackResponse = await GET();
        const fallbackBody = await fallbackResponse.json();
        expect(fallbackBody.success).toBe(true);
        expect(fallbackBody.data.source).toBe("watchlist");
        expect(fallbackBody.data.gainers[0].id).toBe("w1");

        const recoveredResponse = await GET();
        const recoveredBody = await recoveredResponse.json();
        expect(recoveredBody.success).toBe(true);
        expect(recoveredBody.data.source).toBe("csfloat");
        expect(recoveredBody.data.gainers[0].id).toBe("m1");
        expect(mockResolveMarketProvider).toHaveBeenCalledTimes(2);
    });

    it("ignores watchlist-only persistent cache and recomputes live movers", async () => {
        const { GET } = await import("@/app/api/market/top-movers/route");
        mockTopMoversCacheFindUnique.mockResolvedValue({
            id: "singleton",
            gainers: JSON.stringify([
                {
                    id: "cached-watch",
                    name: "Cached Watch",
                    marketHashName: "Cached Watch",
                    price: 100,
                    change24h: 10,
                    sparkline: [],
                },
            ]),
            losers: JSON.stringify([]),
            source: "watchlist",
            updatedAt: new Date(),
        } as never);
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(makePriceMap([
            { name: "Live Item", price: 150 },
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { id: "live-1", name: "Live Item", marketHashName: "Live Item" },
        ] as never);
        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 150, timestamp: hoursAgo(1) },
        ] as never);

        const response = await GET();
        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.data.source).toBe("csfloat");
        expect(body.data.gainers[0].id).toBe("live-1");
        expect(mockResolveMarketProvider).toHaveBeenCalledTimes(1);
    });

    it("ignores persistent cache from a different market source", async () => {
        const { GET } = await import("@/app/api/market/top-movers/route");

        mockAppSettingsFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "steam",
            csgotraderSubProvider: "csfloat",
        } as never);
        mockTopMoversCacheFindUnique.mockResolvedValue({
            id: "singleton",
            gainers: JSON.stringify([
                {
                    id: "cached-csfloat",
                    name: "Cached CSFloat",
                    marketHashName: "Cached CSFloat",
                    price: 100,
                    change24h: 5,
                    sparkline: [],
                },
            ]),
            losers: JSON.stringify([]),
            source: "csfloat",
            updatedAt: new Date(),
        } as never);
        mockResolveMarketProvider.mockReturnValue(makeMockProvider(new Map([
            ["Steam Item", { price: 140, source: "steam", timestamp: new Date() }],
        ])) as never);
        mockItemFindMany.mockResolvedValue([
            { marketHashName: "Steam Item" },
            { id: "steam-1", name: "Steam Item", marketHashName: "Steam Item" },
        ] as never);
        mockSnapshotFindMany.mockResolvedValue([
            { price: 100, timestamp: hoursAgo(20) },
            { price: 140, timestamp: hoursAgo(1) },
        ] as never);

        const response = await GET();
        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.data.source).toBe("steam");
        expect(body.data.gainers[0].id).toBe("steam-1");
        expect(mockResolveMarketProvider).toHaveBeenCalledWith("steam");
    });
});
