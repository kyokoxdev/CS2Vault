import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        candlestick: {
            findFirst: vi.fn(),
            upsert: vi.fn(),
        },
        priceSnapshot: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db";
import { aggregateCandlesticks } from "@/lib/candles/aggregator";

const mockCandleFindFirst = vi.mocked(prisma.candlestick.findFirst);
const mockCandleUpsert = vi.mocked(prisma.candlestick.upsert);
const mockSnapshotFindMany = vi.mocked(prisma.priceSnapshot.findMany);
const mockSnapshotFindFirst = vi.mocked(prisma.priceSnapshot.findFirst);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("aggregateCandlesticks", () => {
    const itemId = "test-item";

    it("aggregates standard and steam-intelligence price snapshots correctly", async () => {
        // No last candle
        mockCandleFindFirst.mockResolvedValue(null);
        // No prev snapshot
        mockSnapshotFindFirst.mockResolvedValue(null);

        // Mock price snapshots returned:
        // 1. Standard snapshot at 10:00 (Price: 100, Vol: 5)
        // 2. Intelligence snapshot at 10:05 (Price: 150, Vol: 10) - price should be ignored, vol added
        // 3. Standard snapshot at 10:10 (Price: 120, Vol: 3)
        const mockSnapshots = [
            {
                id: 1,
                itemId,
                price: 100,
                volume: 5,
                source: "pricempire",
                timestamp: new Date("2026-06-21T10:00:00Z"),
            },
            {
                id: 2,
                itemId,
                price: 150,
                volume: 10,
                source: "steam-intelligence",
                timestamp: new Date("2026-06-21T10:05:00Z"),
            },
            {
                id: 3,
                itemId,
                price: 120,
                volume: 3,
                source: "pricempire",
                timestamp: new Date("2026-06-21T10:10:00Z"),
            },
        ];

        mockSnapshotFindMany.mockResolvedValue(mockSnapshots as any);

        const count = await aggregateCandlesticks(itemId, "15m");
        expect(count).toBe(1);

        // Check upsert was called with correct data
        // For a 15m interval, all three snapshots fall into the same candle:
        // timestamp: 10:00:00Z.
        // - Open price: 100 (from first standard snapshot)
        // - High price: 120 (150 from intelligence is ignored, standard max is 120)
        // - Low price: 100 (150 from intelligence is ignored, standard min is 100)
        // - Close price: 120 (from last standard snapshot)
        // - Volume: 5 + 10 + 3 = 18 (all volumes aggregated)
        expect(mockCandleUpsert).toHaveBeenCalledTimes(1);
        expect(mockCandleUpsert).toHaveBeenCalledWith({
            where: {
                itemId_interval_timestamp: {
                    itemId,
                    interval: "15m",
                    timestamp: new Date("2026-06-21T10:00:00Z"),
                },
            },
            create: {
                itemId,
                interval: "15m",
                open: 100,
                high: 120,
                low: 100,
                close: 120,
                volume: 18,
                timestamp: new Date("2026-06-21T10:00:00Z"),
            },
            update: {
                high: 120,
                low: 100,
                close: 120,
                volume: 18,
            },
        });
    });

    it("uses last known price to initialize candle when only steam-intelligence snapshots are present in the period", async () => {
        // Last candle ended with close: 95
        mockCandleFindFirst.mockResolvedValue({
            itemId,
            interval: "15m",
            open: 90,
            high: 98,
            low: 88,
            close: 95,
            volume: 20,
            timestamp: new Date("2026-06-21T09:45:00Z"),
        } as any);

        // Only steam-intelligence snapshot in the 10:00 period (Price: 160, Vol: 15)
        const mockSnapshots = [
            {
                id: 4,
                itemId,
                price: 160,
                volume: 15,
                source: "steam-intelligence",
                timestamp: new Date("2026-06-21T10:00:00Z"),
            },
        ];

        mockSnapshotFindMany.mockResolvedValue(mockSnapshots as any);

        const count = await aggregateCandlesticks(itemId, "15m");
        expect(count).toBe(1);

        // The candle should be initialized with the last known price (95) from last candle close,
        // and volume from the intelligence snapshot (15).
        expect(mockCandleUpsert).toHaveBeenCalledWith({
            where: {
                itemId_interval_timestamp: {
                    itemId,
                    interval: "15m",
                    timestamp: new Date("2026-06-21T10:00:00Z"),
                },
            },
            create: {
                itemId,
                interval: "15m",
                open: 95,
                high: 95,
                low: 95,
                close: 95,
                volume: 15,
                timestamp: new Date("2026-06-21T10:00:00Z"),
            },
            update: {
                high: 95,
                low: 95,
                close: 95,
                volume: 15,
            },
        });
    });
});
