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
    return await import("@/lib/market/market-cap");
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValue({} as never);
    vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getMarketCap", () => {
    it("returns snapshot data when available", async () => {
        const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce({
            id: "1",
            totalMarketCap: 2500000,
            totalListings: 25000,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: recentDate,
        } as never);
        const { getMarketCap } = await importModule();

        const result = await getMarketCap();

        expect(result.status).toBe("ok");
        expect(result.data).not.toBeNull();
        expect(result.data?.totalMarketCap).toBe(2500000);
        expect(result.data?.itemCount).toBe(25000);
        expect(result.data?.provider).toBe("csgotrader-csfloat");
        expect(result.data?.source).toBe("snapshot");
    });

    it("returns error when no snapshot exists", async () => {
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce(null);
        const { getMarketCap } = await importModule();

        const result = await getMarketCap();

        expect(result.status).toBe("error");
        expect(result.data).toBeNull();
        expect(result.message).toContain("Waiting for cron calculation");
    });

    it("returns stale status when snapshot is old", async () => {
        const oldDate = new Date(Date.now() - 26 * 60 * 60 * 1000);
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce({
            id: "1",
            totalMarketCap: 2500000,
            totalListings: 25000,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: oldDate,
        } as never);
        const { getMarketCap } = await importModule();

        const result = await getMarketCap();

        expect(result.status).toBe("stale");
        expect(result.data).not.toBeNull();
        expect(result.message).toContain("hours old");
    });
});

describe("calculateAndStoreMarketCap", () => {
    it("calculates market cap from CSGOTrader csfloat.json", async () => {
        mockFetchSuccess({
            "AK-47 | Redline (Field-Tested)": { price: 15.50 },
            "AWP | Dragon Lore (Factory New)": { price: 5000.00 },
            "M4A4 | Howl (Minimal Wear)": { price: 3500.00 },
        });
        vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValueOnce({
            id: "new",
            totalMarketCap: 8515.50,
            totalListings: 3,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: new Date(),
        } as never);
        const { calculateAndStoreMarketCap } = await importModule();

        const result = await calculateAndStoreMarketCap();

        expect(result.status).toBe("ok");
        expect(result.data).not.toBeNull();
        expect(result.data?.itemCount).toBe(3);
        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                totalMarketCap: 8515.50,
                totalListings: 3,
                provider: "csgotrader-csfloat",
            }),
        });
    });

    it("skips items with null or invalid prices", async () => {
        mockFetchSuccess({
            "Good Item": { price: 100.00 },
            "No Price": { price: null },
            "Negative": { price: -50 },
            "Zero": { price: 0 },
        });
        vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValueOnce({
            id: "new",
            totalMarketCap: 100,
            totalListings: 1,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: new Date(),
        } as never);
        const { calculateAndStoreMarketCap } = await importModule();

        const result = await calculateAndStoreMarketCap();

        expect(result.data?.itemCount).toBe(1);
        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                totalMarketCap: 100,
                totalListings: 1,
            }),
        });
    });

    it("returns error when fetch fails", async () => {
        mockFetchFailure("Network error");
        const { calculateAndStoreMarketCap } = await importModule();

        const result = await calculateAndStoreMarketCap();

        expect(result.status).toBe("error");
        expect(result.data).toBeNull();
        expect(result.message).toContain("Network error");
    });

    it("returns error when API returns non-OK status", async () => {
        mockFetchSuccess(null, 503);
        const { calculateAndStoreMarketCap } = await importModule();

        const result = await calculateAndStoreMarketCap();

        expect(result.status).toBe("error");
        expect(result.data).toBeNull();
    });

    it("cleans up old snapshots after successful calculation", async () => {
        mockFetchSuccess({ "Item": { price: 50.00 } });
        vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValueOnce({
            id: "new",
            totalMarketCap: 50,
            totalListings: 1,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: new Date(),
        } as never);
        const { calculateAndStoreMarketCap } = await importModule();

        await calculateAndStoreMarketCap();

        expect(prisma.marketCapSnapshot.deleteMany).toHaveBeenCalledWith({
            where: expect.objectContaining({
                provider: "csgotrader-csfloat",
            }),
        });
    });
});

describe("shouldRecalculate", () => {
    it("returns true when no snapshot exists", async () => {
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce(null);
        const { shouldRecalculate } = await importModule();

        const result = await shouldRecalculate();

        expect(result).toBe(true);
    });

    it("returns false when recent snapshot exists", async () => {
        const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000);
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce({
            id: "1",
            totalMarketCap: 2500000,
            totalListings: 25000,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: recentDate,
        } as never);
        const { shouldRecalculate } = await importModule();

        const result = await shouldRecalculate();

        expect(result).toBe(false);
    });

    it("returns true when snapshot is older than 20 hours", async () => {
        const oldDate = new Date(Date.now() - 21 * 60 * 60 * 1000);
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValueOnce({
            id: "1",
            totalMarketCap: 2500000,
            totalListings: 25000,
            provider: "csgotrader-csfloat",
            topItems: null,
            timestamp: oldDate,
        } as never);
        const { shouldRecalculate } = await importModule();

        const result = await shouldRecalculate();

        expect(result).toBe(true);
    });
});
