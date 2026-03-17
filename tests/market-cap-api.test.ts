import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketCapResult } from "@/lib/market/pricempire-trending";

vi.mock("@/lib/market/pricempire-trending", () => ({
    fetchMarketCapData: vi.fn(),
    cleanupOldSnapshots: vi.fn(),
}));

import { fetchMarketCapData, cleanupOldSnapshots } from "@/lib/market/pricempire-trending";
import { GET } from "@/app/api/market/market-cap/route";

function createMockResult(
    overrides: Partial<MarketCapResult> = {}
): MarketCapResult {
    return {
        status: "ok",
        data: {
            totalMarketCap: 1500000,
            timestamp: new Date("2026-02-28T12:00:00Z"),
            provider: "pricempire",
            source: "api",
        },
        ...overrides,
    };
}

describe("GET /api/market/market-cap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(cleanupOldSnapshots).mockResolvedValue(undefined as never);
    });

    it("returns success response with market cap data", async () => {
        const mockResult = createMockResult();
        vi.mocked(fetchMarketCapData).mockResolvedValue(mockResult);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.status).toBe("ok");
        expect(data.data.totalMarketCap).toBe(1500000);
        expect(data.data.timestamp).toBe("2026-02-28T12:00:00.000Z");
        expect(data.data.provider).toBe("pricempire");
        expect(data.data.source).toBe("api");
    });

    it("returns missing_key status when API key is not configured", async () => {
        vi.mocked(fetchMarketCapData).mockResolvedValue({
            status: "missing_key",
            data: null,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.status).toBe("missing_key");
        expect(data.data).toBeNull();
    });

    it("returns 500 when data is null with error status", async () => {
        vi.mocked(fetchMarketCapData).mockResolvedValue({
            status: "error",
            data: null,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
            status: "error",
            error: "Failed to fetch market cap data",
        });
    });

    it("returns 500 when fetchMarketCapData throws", async () => {
        vi.mocked(fetchMarketCapData).mockRejectedValue(new Error("boom"));

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
            status: "error",
            error: "Failed to fetch market cap data",
        });
    });

    it("calls cleanupOldSnapshots after success", async () => {
        vi.mocked(fetchMarketCapData).mockResolvedValue(createMockResult());

        await GET();

        expect(cleanupOldSnapshots).toHaveBeenCalledTimes(1);
    });
});
