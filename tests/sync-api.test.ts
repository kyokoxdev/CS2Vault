import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/market/init", () => ({
    initializeMarketProviders: vi.fn(),
}));

vi.mock("@/lib/market/sync", () => ({
    runSync: vi.fn(),
    getRecentSyncLogs: vi.fn(),
    getLatestPriceUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

import { runSync, getRecentSyncLogs, getLatestPriceUpdate } from "@/lib/market/sync";
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
        expect(runSync).not.toHaveBeenCalled();
    });

    it("runs price sync for authorized cron requests", async () => {
        vi.mocked(runSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 12,
            duration: 321,
            type: "market_prices",
        } as never);

        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer test-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(runSync).toHaveBeenCalledTimes(1);
        expect(payload.data.sync.status).toBe("success");
    });

    it("returns 500 when price sync fails", async () => {
        vi.mocked(runSync).mockResolvedValueOnce({
            status: "failed",
            itemCount: 0,
            duration: 111,
            type: "market_prices",
            error: "Provider failed",
        } as never);

        const request = new Request("http://localhost/api/sync", {
            headers: {
                authorization: "Bearer test-secret",
            },
        });

        const response = await GET(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload.success).toBe(false);
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
        expect(runSync).not.toHaveBeenCalled();
    });
});

describe("POST /api/sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-secret";
        vi.mocked(requireAuth).mockResolvedValue({
            session: { user: { steamId: "123" } },
            error: null,
        } as never);
    });

    it("runs price sync for authenticated manual requests", async () => {
        vi.mocked(runSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 5,
            duration: 222,
            type: "market_prices",
        } as never);

        const request = new Request("http://localhost/api/sync");
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(runSync).toHaveBeenCalledTimes(1);
        expect(payload.data.sync.status).toBe("success");
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

    it("passes steam fallback override when requested", async () => {
        vi.mocked(runSync).mockResolvedValueOnce({
            status: "success",
            itemCount: 3,
            duration: 150,
            type: "market_prices",
        } as never);

        const request = new Request("http://localhost/api/sync?fallback=steam");
        const response = await POST(toNextRequest(request));

        expect(response.status).toBe(200);
        expect(runSync).toHaveBeenCalledWith("steam");
    });
});

afterEach(() => {
    if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET;
        return;
    }

    process.env.CRON_SECRET = originalCronSecret;
});
