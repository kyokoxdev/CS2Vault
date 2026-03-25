/**
 * Integration Tests: Sync Pipeline
 * Tests settings → provider resolution → bulk fetch → price storage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies BEFORE imports
vi.mock("@/lib/db", () => ({
    prisma: {
        appSettings: { findUnique: vi.fn() },
        item: { findMany: vi.fn() },
        priceSnapshot: { create: vi.fn() },
        syncLog: { create: vi.fn() },
    },
}));

vi.mock("@/lib/market/registry", () => ({
    getMarketProvider: vi.fn(),
}));

vi.mock("@/lib/candles/aggregator", () => ({
    aggregateAllIntervals: vi.fn(),
}));

vi.mock("@/lib/market/init", () => ({
    initializeMarketProviders: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { getMarketProvider } from "@/lib/market/registry";
import { runSync } from "@/lib/market/sync";

const mockFindUnique = vi.mocked(prisma.appSettings.findUnique);
const mockFindMany = vi.mocked(prisma.item.findMany);
const mockSnapshotCreate = vi.mocked(prisma.priceSnapshot.create);
const mockSyncLogCreate = vi.mocked(prisma.syncLog.create);
const mockGetProvider = vi.mocked(getMarketProvider);

function createMockProvider(name: string, prices: Map<string, { price: number; volume?: number; source: string; timestamp: Date }>) {
    return {
        name,
        fetchBulkPrices: vi.fn().mockResolvedValue(prices),
        fetchItemPrice: vi.fn(),
        getRateLimitConfig: vi.fn(),
    };
}

describe("Sync Integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockSnapshotCreate.mockResolvedValue({} as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockSyncLogCreate.mockResolvedValue({} as any);
    });

    it("syncs prices from configured provider", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csfloat",
            watchlistOnly: false,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([
            { id: "item-1", marketHashName: "AK-47 | Redline (Field-Tested)" },
            { id: "item-2", marketHashName: "AWP | Asiimov (Field-Tested)" },
        ] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        const prices = new Map([
            ["AK-47 | Redline (Field-Tested)", { price: 1250, volume: 100, source: "csfloat", timestamp: new Date() }],
            ["AWP | Asiimov (Field-Tested)", { price: 3500, volume: 50, source: "csfloat", timestamp: new Date() }],
        ]);
        const mockProvider = createMockProvider("csfloat", prices);
        mockGetProvider.mockReturnValue(mockProvider as ReturnType<typeof mockGetProvider>);

        const result = await runSync();

        expect(result.status).toBe("success");
        expect(result.itemCount).toBe(2);
        expect(mockSnapshotCreate).toHaveBeenCalledTimes(2);
        expect(mockSyncLogCreate).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "success" }) })
        );
    });

    it("falls back to steam when provider not registered", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csfloat",
            watchlistOnly: false,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([
            { id: "item-1", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        mockGetProvider
            .mockImplementationOnce(() => { throw new Error("not registered"); });

        const result = await runSync();

        expect(result.status).toBe("failed");
        expect(result.itemCount).toBe(0);
        expect(result.error).toBe('Provider "csfloat" not registered');
        expect(mockGetProvider).toHaveBeenCalledTimes(1);
    });

    it("falls back to steam when provider returns empty prices", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csgotrader",
            watchlistOnly: false,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([
            { id: "item-1", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        const emptyProvider = createMockProvider("csgotrader", new Map());
        mockGetProvider
            .mockReturnValueOnce(emptyProvider as ReturnType<typeof mockGetProvider>);

        const result = await runSync();

        expect(result.status).toBe("failed");
        expect(result.itemCount).toBe(0);
        expect(result.error).toBe('Provider "csgotrader" returned 0 prices for 1 items');
    });

    it("handles zero items gracefully", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csfloat",
            watchlistOnly: true,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        const result = await runSync();

        expect(result.status).toBe("success");
        expect(result.itemCount).toBe(0);
        expect(mockGetProvider).not.toHaveBeenCalled();
    });

    it("records sync failure on error", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csgotrader",
            watchlistOnly: false,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([
            { id: "item-1", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        const failProvider = {
            name: "csgotrader",
            fetchBulkPrices: vi.fn().mockRejectedValue(new Error("API down")),
            fetchItemPrice: vi.fn(),
            getRateLimitConfig: vi.fn(),
        };
        mockGetProvider.mockReturnValue(failProvider as ReturnType<typeof mockGetProvider>);

        const result = await runSync();

        expect(result.status).toBe("failed");
        expect(result.error).toBe('Provider "csgotrader" failed: API down');
        expect(mockSyncLogCreate).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
        );
    });

    it("uses override source when provided", async () => {
        mockFindUnique.mockResolvedValue({
            id: "singleton",
            activeMarketSource: "csfloat",
            watchlistOnly: false,
        } as ReturnType<typeof mockFindUnique> extends Promise<infer T> ? T : never);

        mockFindMany.mockResolvedValue([
            { id: "item-1", marketHashName: "AK-47 | Redline (Field-Tested)" },
        ] as ReturnType<typeof mockFindMany> extends Promise<infer T> ? T : never);

        const prices = new Map([
            ["AK-47 | Redline (Field-Tested)", { price: 1300, source: "csgotrader", timestamp: new Date() }],
        ]);
        const csgoProvider = createMockProvider("csgotrader", prices);
        mockGetProvider.mockReturnValue(csgoProvider as ReturnType<typeof mockGetProvider>);

        const result = await runSync("csgotrader");

        expect(result.status).toBe("success");
        expect(mockGetProvider).toHaveBeenCalledWith("csgotrader");
    });
});
