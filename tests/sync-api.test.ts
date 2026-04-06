import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/market/scheduler", () => ({
    triggerManualSync: vi.fn(),
}));

vi.mock("@/lib/market/sync", () => ({
    getRecentSyncLogs: vi.fn(),
    getLatestPriceUpdate: vi.fn(),
}));

vi.mock("@/lib/market/market-cap", () => ({
    shouldRecalculate: vi.fn(),
    calculateAndStoreMarketCap: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

import { triggerManualSync } from "@/lib/market/scheduler";
import { getRecentSyncLogs, getLatestPriceUpdate } from "@/lib/market/sync";
import {
    calculateAndStoreMarketCap,
    shouldRecalculate,
} from "@/lib/market/market-cap";
import { requireAuth } from "@/lib/auth/guard";
import { GET, POST } from "@/app/api/sync/route";

const originalCronSecret = process.env.CRON_SECRET;

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

describe("GET /api/sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-secret";
        vi.mocked(requireAuth).mockResolvedValue({
            session: { user: { steamId: "123" } },
            error: null,
        } as never);
    });

    it("returns sync logs for non-cron requests", async () => {
        vi.mocked(getRecentSyncLogs).mockResolvedValueOnce([
            { id: 1, status: "success" },
        ] as never);
        vi.mocked(getLatestPriceUpdate).mockResolvedValueOnce(
            new Date("2026-04-01T12:00:00.000Z")
        );

        const request = new Request("http://localhost/api/sync");
        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.logs).toHaveLength(1);
        expect(payload.data.lastPriceUpdate).toBe("2026-04-01T12:00:00.000Z");
        expect(triggerManualSync).not.toHaveBeenCalled();
    });

    it("runs sync and market cap recalculation for authorized cron requests", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 12,
            duration: 321,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(true);
        vi.mocked(calculateAndStoreMarketCap).mockResolvedValueOnce({
            status: "ok",
            data: {
                totalMarketCap: 100,
                itemCount: 2,
                timestamp: new Date("2026-03-25T00:00:00.000Z"),
                provider: "csgotrader-csfloat",
                source: "calculated",
            },
        });

        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer test-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(triggerManualSync).toHaveBeenCalledTimes(1);
        expect(shouldRecalculate).toHaveBeenCalledTimes(1);
        expect(calculateAndStoreMarketCap).toHaveBeenCalledTimes(1);
        expect(payload.data.marketCap.attempted).toBe(true);
        expect(payload.data.marketCap.status).toBe("ok");
    });

    it("skips market cap recalculation when recent snapshot exists", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 7,
            duration: 111,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(false);

        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer test-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(calculateAndStoreMarketCap).not.toHaveBeenCalled();
        expect(payload.data.marketCap.status).toBe("skipped");
    });

    it("returns 500 when market cap calculation fails", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 7,
            duration: 111,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(true);
        vi.mocked(calculateAndStoreMarketCap).mockResolvedValueOnce({
            status: "error",
            data: null,
            message: "Calculation failed",
        });

        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer test-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload.success).toBe(false);
        expect(payload.data.marketCap.status).toBe("error");
    });

    it("runs market cap recalculation for authenticated manual sync requests when stale", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 5,
            duration: 222,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(true);
        vi.mocked(calculateAndStoreMarketCap).mockResolvedValueOnce({
            status: "ok",
            data: {
                totalMarketCap: 100,
                itemCount: 2,
                timestamp: new Date("2026-03-25T00:00:00.000Z"),
                provider: "csgotrader-csfloat",
                source: "calculated",
            },
        });

        const request = new Request("http://localhost/api/sync");
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(triggerManualSync).toHaveBeenCalledTimes(1);
        expect(shouldRecalculate).toHaveBeenCalledTimes(1);
        expect(calculateAndStoreMarketCap).toHaveBeenCalledTimes(1);
        expect(payload.data.sync.status).toBe("success");
        expect(payload.data.marketCap.attempted).toBe(true);
        expect(payload.data.marketCap.status).toBe("ok");
    });

    it("skips manual market cap recalculation when recent snapshot exists", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 5,
            duration: 222,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(false);

        const request = new Request("http://localhost/api/sync");
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(calculateAndStoreMarketCap).not.toHaveBeenCalled();
        expect(payload.data.marketCap.status).toBe("skipped");
    });

    it("returns 500 when manual sync market cap recalculation fails", async () => {
        vi.mocked(triggerManualSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 5,
            duration: 222,
            type: "market_prices",
        } as never);
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(true);
        vi.mocked(calculateAndStoreMarketCap).mockResolvedValueOnce({
            status: "error",
            data: null,
            message: "Calculation failed",
        });

        const request = new Request("http://localhost/api/sync");
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload.success).toBe(false);
        expect(payload.data.marketCap.status).toBe("error");
    });

    it("returns auth error for unauthenticated manual sync requests", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: null,
            error: new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        } as never);

        const request = new Request("http://localhost/api/sync");
        const response = await POST(toNextRequest(request));

        expect(response.status).toBe(401);
    });

    it("returns 401 when cron auth header is present but wrong", async () => {
        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer wrong-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.success).toBe(false);
        expect(triggerManualSync).not.toHaveBeenCalled();
    });
});

afterEach(() => {
    if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET;
        return;
    }

    process.env.CRON_SECRET = originalCronSecret;
});
