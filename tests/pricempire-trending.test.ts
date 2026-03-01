import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        marketCapSnapshot: {
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db";

const mockFetch = vi.fn();

const sampleTrendingData = [
    { marketHashName: "AK-47 | Redline (FT)", price: 15.5, change24h: 2.5, volume: 1000 },
    { marketHashName: "AWP | Asiimov (FT)", price: 42.0, change24h: -1.2, volume: 500 },
];

function mockFetchResponse(data: unknown, ok = true, status = 200) {
    mockFetch.mockResolvedValueOnce({
        ok,
        status,
        statusText: ok ? "OK" : "Internal Server Error",
        json: () => Promise.resolve(data),
    });
}

async function importModule() {
    return await import("@/lib/market/pricempire-trending");
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValue({} as never);
    vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchMarketCapData", () => {
    it("returns MarketCapData for array response", async () => {
        mockFetchResponse(sampleTrendingData);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).not.toBeNull();
        expect(result?.provider).toBe("youpin");
        expect(result?.totalListings).toBe(2);
        expect(result?.topItems).toEqual([
            { marketHashName: "AK-47 | Redline (FT)", price: 15.5, change24h: 2.5, volume: 1000 },
            { marketHashName: "AWP | Asiimov (FT)", price: 42.0, change24h: -1.2, volume: 500 },
        ]);
        expect(result?.totalMarketCap).toBe(36500);
        expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it("handles { data: [...] } response format", async () => {
        mockFetchResponse({ data: [{ marketHashName: "AK-47 | Redline (FT)", price: 10 }] });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.totalListings).toBe(1);
        expect(result?.totalMarketCap).toBe(10);
        expect(result?.topItems).toEqual([
            { marketHashName: "AK-47 | Redline (FT)", price: 10, change24h: undefined, volume: undefined },
        ]);
    });

    it("filters items without marketHashName", async () => {
        mockFetchResponse([
            { price: 12, change24h: 1 },
            { marketHashName: "Valid Item", price: 12, change24h: 1, volume: 2 },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.totalListings).toBe(1);
        expect(result?.topItems).toEqual([
            { marketHashName: "Valid Item", price: 12, change24h: 1, volume: 2 },
        ]);
        expect(result?.totalMarketCap).toBe(24);
    });

    it("filters items with non-positive price", async () => {
        mockFetchResponse([
            { marketHashName: "Zero", price: 0 },
            { marketHashName: "Negative", price: -5 },
            { marketHashName: "Positive", price: 8, volume: 3 },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.totalListings).toBe(1);
        expect(result?.topItems).toEqual([
            { marketHashName: "Positive", price: 8, change24h: undefined, volume: 3 },
        ]);
        expect(result?.totalMarketCap).toBe(24);
    });

    it("stores snapshot via prisma.marketCapSnapshot.create", async () => {
        mockFetchResponse(sampleTrendingData);
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: {
                totalMarketCap: 36500,
                totalListings: 2,
                provider: "youpin",
                topItems: JSON.stringify([
                    { marketHashName: "AK-47 | Redline (FT)", price: 15.5, change24h: 2.5, volume: 1000 },
                    { marketHashName: "AWP | Asiimov (FT)", price: 42.0, change24h: -1.2, volume: 500 },
                ]),
                timestamp: expect.any(Date),
            },
        });
    });

    it("returns null on failed fetch with no cache", async () => {
        mockFetchResponse({}, false, 500);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
        expect(prisma.marketCapSnapshot.create).not.toHaveBeenCalled();
    });

    it("returns null when fetch throws on first call", async () => {
        mockFetch.mockRejectedValueOnce(new Error("boom"));
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });
});

describe("cleanupOldSnapshots", () => {
    it("calls deleteMany with default 30-day cutoff", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 3 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const now = Date.now();
        const result = await cleanupOldSnapshots();

        expect(result).toBe(3);
        const call = vi.mocked(prisma.marketCapSnapshot.deleteMany).mock.calls[0]?.[0];
        const cutoff = call?.where?.timestamp?.lt as Date;
        const dayMs = 24 * 60 * 60 * 1000;
        const diff = now - cutoff.getTime();
        expect(diff).toBeGreaterThanOrEqual(30 * dayMs - 1000);
        expect(diff).toBeLessThanOrEqual(30 * dayMs + 1000);
    });

    it("uses custom daysToKeep parameter", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 1 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const now = Date.now();
        const result = await cleanupOldSnapshots(10);

        expect(result).toBe(1);
        const call = vi.mocked(prisma.marketCapSnapshot.deleteMany).mock.calls[0]?.[0];
        const cutoff = call?.where?.timestamp?.lt as Date;
        const dayMs = 24 * 60 * 60 * 1000;
        const diff = now - cutoff.getTime();
        expect(diff).toBeGreaterThanOrEqual(10 * dayMs - 1000);
        expect(diff).toBeLessThanOrEqual(10 * dayMs + 1000);
    });

    it("returns deleteMany count", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 7 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const result = await cleanupOldSnapshots(5);

        expect(result).toBe(7);
    });
});
