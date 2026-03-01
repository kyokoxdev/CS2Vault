import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/market/pricempire-trending", () => ({
    fetchMarketCapData: vi.fn(),
    cleanupOldSnapshots: vi.fn(),
}));

import { fetchMarketCapData, cleanupOldSnapshots } from "@/lib/market/pricempire-trending";
import { GET } from "@/app/api/market/market-cap/route";

const createMockData = (overrides: Partial<{
    totalMarketCap: number;
    totalListings: number;
    topItems: unknown;
    timestamp: Date;
    provider: string;
}> = {}) => ({
    totalMarketCap: 1500000,
    totalListings: 50,
    topItems: [
        {
            marketHashName: "AK-47 | Redline (FT)",
            price: 15.5,
            change24h: 2.5,
            volume: 1000,
        },
    ],
    timestamp: new Date("2026-02-28T12:00:00Z"),
    provider: "youpin",
    ...overrides,
});

describe("GET /api/market/market-cap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(cleanupOldSnapshots).mockResolvedValue(undefined as never);
    });

    it("returns success response with array topItems", async () => {
        const mockData = createMockData();
        vi.mocked(fetchMarketCapData).mockResolvedValue(mockData as never);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.totalMarketCap).toBe(mockData.totalMarketCap);
        expect(data.data.totalListings).toBe(mockData.totalListings);
        expect(data.data.topItems).toEqual(mockData.topItems);
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

    it("parses topItems when stored as JSON string", async () => {
        const topItems = [
            {
                marketHashName: "AK-47 | Redline (FT)",
                price: 15.5,
                change24h: 2.5,
                volume: 1000,
            },
        ];
        vi.mocked(fetchMarketCapData).mockResolvedValue(
            createMockData({ topItems: JSON.stringify(topItems) }) as never
        );

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.topItems).toEqual(topItems);
    });

    it("passes through topItems when already array", async () => {
        const topItems = [
            {
                marketHashName: "AK-47 | Redline (FT)",
                price: 15.5,
                change24h: 2.5,
                volume: 1000,
            },
        ];
        vi.mocked(fetchMarketCapData).mockResolvedValue(
            createMockData({ topItems }) as never
        );

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.topItems).toEqual(topItems);
    });
});
