import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/market/bounded-price-sync", () => ({
    runBoundedPriceSync: vi.fn(),
}));

import { runBoundedPriceSync } from "@/lib/market/bounded-price-sync";
import { GET } from "@/app/api/market/price-sync/bounded/route";

const originalCronSecret = process.env.CRON_SECRET;
const mockRunBoundedPriceSync = vi.mocked(runBoundedPriceSync);

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

describe("GET /api/market/price-sync/bounded", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-secret";
        mockRunBoundedPriceSync.mockResolvedValue({
            status: "success",
            selected: 2,
            processed: 2,
            pricedCount: 2,
            skippedRecent: 0,
            remainingDue: 0,
            provider: "csfloat",
            attemptedProvider: "csfloat",
            requestedLimit: 25,
            effectiveLimit: 25,
            budgetMs: 25_000,
            elapsedMs: 1_000,
            remainingMs: 24_000,
            nextRecommendedPingAt: "2026-07-02T10:10:00.000Z",
        });
    });

    it("rejects missing cron auth", async () => {
        const response = await GET(toNextRequest(new Request("http://localhost/api/market/price-sync/bounded")));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.success).toBe(false);
        expect(mockRunBoundedPriceSync).not.toHaveBeenCalled();
    });

    it("rejects wrong bearer cron auth", async () => {
        const response = await GET(toNextRequest(new Request("http://localhost/api/market/price-sync/bounded", {
            headers: { authorization: "Bearer wrong-secret" },
        })));

        expect(response.status).toBe(401);
        expect(mockRunBoundedPriceSync).not.toHaveBeenCalled();
    });

    it("accepts bearer cron auth without a session", async () => {
        const response = await GET(toNextRequest(new Request("http://localhost/api/market/price-sync/bounded", {
            headers: { authorization: "Bearer test-secret" },
        })));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.status).toBe("success");
        expect(mockRunBoundedPriceSync).toHaveBeenCalledWith({
            limit: 25,
            minAgeMinutes: 60,
            budgetMs: 25_000,
        });
    });

    it("accepts x-cron-secret for cron-job.org", async () => {
        const response = await GET(toNextRequest(new Request("http://localhost/api/market/price-sync/bounded", {
            headers: { "x-cron-secret": "test-secret" },
        })));

        expect(response.status).toBe(200);
        expect(mockRunBoundedPriceSync).toHaveBeenCalledTimes(1);
    });

    it("clamps query params to the cron-job.org-safe range", async () => {
        const response = await GET(toNextRequest(new Request(
            "http://localhost/api/market/price-sync/bounded?limit=500&minAgeMinutes=1&budgetMs=60000",
            { headers: { "x-cron-secret": "test-secret" } }
        )));

        expect(response.status).toBe(200);
        expect(mockRunBoundedPriceSync).toHaveBeenCalledWith({
            limit: 100,
            minAgeMinutes: 5,
            budgetMs: 25_000,
        });
    });
});

afterEach(() => {
    if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET;
        return;
    }

    process.env.CRON_SECRET = originalCronSecret;
});
