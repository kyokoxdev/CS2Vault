import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/market/market-cap", () => ({
    shouldRecalculate: vi.fn(),
    calculateAndStoreMarketCap: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

import { calculateAndStoreMarketCap, shouldRecalculate } from "@/lib/market/market-cap";
import { requireAuth } from "@/lib/auth/guard";
import { GET, POST } from "@/app/api/market/market-cap-sync/route";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

describe("/api/market/market-cap-sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CRON_SECRET = "test-secret";
        vi.mocked(requireAuth).mockResolvedValue({
            session: { user: { id: "user-1", steamId: "123" } },
            error: null,
        } as never);
    });

    it("allows authenticated manual POST to force recalculation", async () => {
        vi.mocked(calculateAndStoreMarketCap).mockResolvedValueOnce({
            status: "ok",
            data: {
                totalMarketCap: 123456,
                itemCount: 42,
                timestamp: new Date("2026-04-06T00:00:00.000Z"),
                provider: "csgotrader-csfloat",
                source: "calculated",
            },
        });

        const response = await POST(toNextRequest(new Request("http://localhost/api/market/market-cap-sync", { method: "POST" })));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(shouldRecalculate).not.toHaveBeenCalled();
        expect(calculateAndStoreMarketCap).toHaveBeenCalledTimes(1);
    });

    it("uses cron auth for GET and skips fresh snapshots", async () => {
        vi.mocked(shouldRecalculate).mockResolvedValueOnce(false);

        const response = await GET(toNextRequest(new Request("http://localhost/api/market/market-cap-sync", {
            headers: { authorization: "Bearer test-secret" },
        })));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.skipped).toBe(true);
        expect(calculateAndStoreMarketCap).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated manual POST requests", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: null,
            error: new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        } as never);

        const response = await POST(toNextRequest(new Request("http://localhost/api/market/market-cap-sync", { method: "POST" })));

        expect(response.status).toBe(401);
    });
});
