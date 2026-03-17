import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        marketCapSnapshot: {
            create: vi.fn(),
            findFirst: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db";

function mockFetchSuccess(data: unknown, status = 200) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: () => Promise.resolve(data),
    }));
}

function mockFetchFailure(message: string) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error(message)));
}

async function importModule() {
    return await import("@/lib/market/pricempire-trending");
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("PRICEMPIRE_API_KEY", "test-api-key");
    vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValue({} as never);
    vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("fetchMarketCapData", () => {
    it("returns aggregated market cap from V4 metas endpoint", async () => {
        mockFetchSuccess([
            { market_hash_name: "AK-47 | Redline", marketcap: "500000" },
            { market_hash_name: "AWP | Dragon Lore", marketcap: "1200000" },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.status).toBe("ok");
        expect(result.data).not.toBeNull();
        expect(result.data?.totalMarketCap).toBe(17000);
        expect(result.data?.provider).toBe("pricempire");
        expect(result.data?.source).toBe("api");
        expect(result.data?.timestamp).toBeInstanceOf(Date);
    });

    it("handles numeric marketcap values", async () => {
        mockFetchSuccess([
            { market_hash_name: "Item A", marketcap: 300000 },
            { market_hash_name: "Item B", marketcap: 700000 },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data?.totalMarketCap).toBe(10000);
    });

    it("skips items with missing or invalid marketcap", async () => {
        mockFetchSuccess([
            { market_hash_name: "Good Item", marketcap: "1000000" },
            { market_hash_name: "No Cap", count: "50" },
            { market_hash_name: "Negative", marketcap: "-100" },
            { market_hash_name: "NaN", marketcap: "not_a_number" },
            { market_hash_name: "Zero", marketcap: "0" },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data?.totalMarketCap).toBe(10000);
    });

    it("stores snapshot after successful fetch", async () => {
        mockFetchSuccess([{ market_hash_name: "Item", marketcap: "250000" }]);
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: {
                totalMarketCap: 2500,
                totalListings: 0,
                provider: "pricempire",
                topItems: null,
                timestamp: expect.any(Date),
            },
        });
    });

    it("returns missing_key status when PRICEMPIRE_API_KEY is not set", async () => {
        vi.stubEnv("PRICEMPIRE_API_KEY", "");
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.status).toBe("missing_key");
        expect(result.data).toBeNull();
        expect(prisma.marketCapSnapshot.create).not.toHaveBeenCalled();
    });

    it("returns error when API responds with non-OK status", async () => {
        mockFetchSuccess(null, 403);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data).toBeNull();
    });

    it("returns error when fetch throws", async () => {
        mockFetchFailure("Network error");
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data).toBeNull();
    });

    it("returns error when response is empty array", async () => {
        mockFetchSuccess([]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data).toBeNull();
    });

    it("returns error when response is not an array", async () => {
        mockFetchSuccess({ data: "nope" });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.data).toBeNull();
    });

    it("serves cached result within TTL without refetching", async () => {
        mockFetchSuccess([{ market_hash_name: "Item", marketcap: "500000" }]);
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();
        const second = await fetchMarketCapData();

        expect(first).toEqual(second);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it("refetches after TTL expires", async () => {
        const nowSpy = vi.spyOn(Date, "now");
        nowSpy.mockReturnValueOnce(1_000_000);
        mockFetchSuccess([{ market_hash_name: "Item", marketcap: "500000" }]);
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();
        expect(first.data?.totalMarketCap).toBe(5000);

        nowSpy.mockReturnValueOnce(1_000_000 + 15 * 60 * 1000 + 1);
        mockFetchSuccess([{ market_hash_name: "Item", marketcap: "600000" }]);

        const second = await fetchMarketCapData();

        expect(second.data?.totalMarketCap).toBe(6000);
        nowSpy.mockRestore();
    });

    it("falls back to DB snapshot when API fails", async () => {
        mockFetchFailure("timeout");
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce({
            id: 1,
            totalMarketCap: 25000,
            totalListings: 0,
            provider: "pricempire",
            topItems: null,
            timestamp: new Date("2024-01-01"),
        } as never);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result.status).toBe("ok");
        expect(result.data?.totalMarketCap).toBe(25000);
        expect(result.data?.source).toBe("snapshot");
    });

    it("sends correct Authorization header", async () => {
        mockFetchSuccess([{ market_hash_name: "Item", marketcap: "100000" }]);
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "https://api.pricempire.com/v4/paid/items/metas?app_id=730",
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer test-api-key",
                }),
            }),
        );
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
});
