import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketCapResult } from "@/lib/market/market-cap";

vi.mock("@/lib/market/market-cap", () => ({
    getMarketCap: vi.fn(),
}));

import { getMarketCap } from "@/lib/market/market-cap";
import { GET } from "@/app/api/market/market-cap/route";

function createMockResult(
    overrides: Partial<MarketCapResult> = {}
): MarketCapResult {
    return {
        status: "ok",
        data: {
            totalMarketCap: 1500000,
            itemCount: 25000,
            timestamp: new Date("2026-02-28T12:00:00Z"),
            provider: "csgotrader-csfloat",
            source: "snapshot",
        },
        ...overrides,
    };
}

describe("GET /api/market/market-cap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns success response with market cap data", async () => {
        const mockResult = createMockResult();
        vi.mocked(getMarketCap).mockResolvedValue(mockResult);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.status).toBe("ok");
        expect(data.data.totalMarketCap).toBe(1500000);
        expect(data.data.itemCount).toBe(25000);
        expect(data.data.timestamp).toBe("2026-02-28T12:00:00.000Z");
        expect(data.data.provider).toBe("csgotrader-csfloat");
        expect(data.data.source).toBe("snapshot");
    });

    it("returns no_data status when no snapshot exists", async () => {
        vi.mocked(getMarketCap).mockResolvedValue({
            status: "error",
            data: null,
            message: "No market cap data available. Waiting for cron calculation.",
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.status).toBe("no_data");
        expect(data.data).toBeNull();
    });

    it("returns stale status when data is old", async () => {
        vi.mocked(getMarketCap).mockResolvedValue({
            status: "stale",
            data: {
                totalMarketCap: 1500000,
                itemCount: 25000,
                timestamp: new Date("2026-02-26T12:00:00Z"),
                provider: "csgotrader-csfloat",
                source: "snapshot",
            },
            message: "Data is 48 hours old. Cron may have failed.",
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.status).toBe("stale");
        expect(data.data.totalMarketCap).toBe(1500000);
        expect(data.message).toContain("hours old");
    });

    it("returns 500 when getMarketCap throws", async () => {
        vi.mocked(getMarketCap).mockRejectedValue(new Error("boom"));

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
            status: "error",
            error: "Failed to fetch market cap data",
        });
    });
});
