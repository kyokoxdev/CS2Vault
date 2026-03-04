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
    it("returns chart-based market cap using the latest entry in cents", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () =>
                Promise.resolve([
                    { date: "2024-01-01", value: 1200 },
                    { date: "2024-01-02", value: 4567 },
                ]),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).not.toBeNull();
        expect(result?.provider).toBe("csfloat");
        expect(result?.source).toBe("chart");
        expect(result?.totalMarketCap).toBeCloseTo(45.67, 2);
        expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it("stores snapshot with normalized fields", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve([{ date: "2024-01-01", value: 2500 }]),
        });
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: {
                totalMarketCap: 25,
                totalListings: 0,
                provider: "csfloat",
                topItems: null,
                timestamp: expect.any(Date),
            },
        });
    });

    it("falls back to summary API when chart fetch fails", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: () => Promise.resolve({}),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: { marketCapUsd: 1234 } }),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.source).toBe("formula");
        expect(result?.totalMarketCap).toBe(1234);
        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: {
                totalMarketCap: 1234,
                totalListings: 0,
                provider: "csfloat",
                topItems: null,
                timestamp: expect.any(Date),
            },
        });
    });

    it("falls back when chart response is empty", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve([]),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: { marketCapUsd: 987 } }),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.source).toBe("formula");
        expect(result?.totalMarketCap).toBe(987);
    });

    it("falls back when chart returns a non-array response", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: "nope" }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: { marketCapUsd: 654 } }),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.source).toBe("formula");
        expect(result?.totalMarketCap).toBe(654);
    });

    it("falls back when chart latest value is non-positive", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve([{ date: "2024-01-01", value: -5 }]),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: { marketCapUsd: 321 } }),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.source).toBe("formula");
        expect(result?.totalMarketCap).toBe(321);
    });

    it("returns null when chart and summary both fail", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: () => Promise.resolve({}),
        });
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: () => Promise.resolve({}),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
        expect(prisma.marketCapSnapshot.create).not.toHaveBeenCalled();
    });

    it("returns null when both requests throw", async () => {
        mockFetch.mockRejectedValueOnce(new Error("chart down"));
        mockFetch.mockRejectedValueOnce(new Error("summary down"));
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });

    it("falls back when chart request throws", async () => {
        mockFetch.mockRejectedValueOnce(new Error("chart down"));
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: { marketCapUsd: 888 } }),
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result?.source).toBe("formula");
        expect(result?.totalMarketCap).toBe(888);
    });

    it("serves cached data within TTL without refetching", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve([{ date: "2024-01-01", value: 7777 }]),
        });
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();
        const second = await fetchMarketCapData();

        expect(first).toEqual(second);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns stale cache when refetch fails after TTL", async () => {
        const nowSpy = vi.spyOn(Date, "now");
        nowSpy.mockReturnValueOnce(1_000_000);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve([{ date: "2024-01-01", value: 9999 }]),
        });
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();

        nowSpy.mockReturnValueOnce(1_000_000 + 15 * 60 * 1000 + 1);
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: () => Promise.resolve({}),
        });
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: () => Promise.resolve({}),
        });

        const second = await fetchMarketCapData();

        expect(second).toEqual(first);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        nowSpy.mockRestore();
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
        const where = call?.where as { timestamp?: { lt?: Date } } | undefined;
        const cutoff = where?.timestamp?.lt as Date;
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
        const where = call?.where as { timestamp?: { lt?: Date } } | undefined;
        const cutoff = where?.timestamp?.lt as Date;
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
