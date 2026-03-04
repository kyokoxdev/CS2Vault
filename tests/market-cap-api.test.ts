import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/market/pricempire-trending", () => ({
    fetchMarketCapData: vi.fn(),
    cleanupOldSnapshots: vi.fn(),
}));

import { fetchMarketCapData, cleanupOldSnapshots } from "@/lib/market/pricempire-trending";
import { GET } from "@/app/api/market/market-cap/route";

const createMockData = (
    overrides: Partial<{
        totalMarketCap: number;
        timestamp: Date;
        provider: string;
        source: "chart" | "formula";
    }> = {}
) => ({
    totalMarketCap: 1500000,
    timestamp: new Date("2026-02-28T12:00:00Z"),
    provider: "csfloat",
    source: "chart" as const,
    ...overrides,
});

describe("GET /api/market/market-cap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(cleanupOldSnapshots).mockResolvedValue(undefined as never);
    });

    it("returns success response", async () => {
        const mockData = createMockData();
        vi.mocked(fetchMarketCapData).mockResolvedValue(mockData as never);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.totalMarketCap).toBe(mockData.totalMarketCap);
        expect(data.data.timestamp).toBe(mockData.timestamp.toISOString());
        expect(data.data.provider).toBe(mockData.provider);
    });

    it("returns 500 when fetchMarketCapData returns null", async () => {
        vi.mocked(fetchMarketCapData).mockResolvedValue(null as never);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({
            success: false,
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
            error: "Failed to fetch market cap data",
        });
    });

    it("calls cleanupOldSnapshots after success", async () => {
        vi.mocked(fetchMarketCapData).mockResolvedValue(createMockData() as never);

        await GET();

        expect(cleanupOldSnapshots).toHaveBeenCalledTimes(1);
    });

});
