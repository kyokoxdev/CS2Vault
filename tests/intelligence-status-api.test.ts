import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceConfig: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("@/lib/market/intelligence/queue", () => ({
    getQueueSummary: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { getQueueSummary } from "@/lib/market/intelligence/queue";

import { GET, POST } from "@/app/api/intelligence/status/route";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

function mockQueueSummary() {
    vi.mocked(getQueueSummary).mockResolvedValue({
        pending: 4,
        running: 1,
        backoff: 2,
        disabled: 0,
        oldestDueAt: null,
        oldestDueAgeMs: null,
    } as never);
}

function mockConfig(liveScmEnabled: boolean) {
    return {
        id: "default",
        liveScmEnabled,
        circuitBreakerUntil: null,
        consecutiveProviderFailures: 0,
        lastRunAt: new Date("2026-01-01T12:00:00Z"),
        lastError: null,
        requestBudget: {},
    };
}

describe("/api/intelligence/status", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQueueSummary();
    });

    it("derives killSwitch from liveScmEnabled on read", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce(mockConfig(false) as never);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.killSwitch).toBe(true);
        expect(payload.data.remainingDue).toBe(6);
        expect(payload.data.processed).toBeNull();
        expect(payload.data.skippedDueToBudget).toBe(0);
    });

    it("reports due rows skipped when the current SCM minute budget is exhausted", async () => {
        vi.mocked(prisma.intelligenceConfig.findUnique).mockResolvedValueOnce({
            ...mockConfig(true),
            requestBudget: {
                scmMinuteStartedAt: new Date().toISOString(),
                scmMinuteCount: 19,
                scmDayStartedAt: new Date().toISOString(),
                scmDayCount: 100,
            },
        } as never);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data.remainingDue).toBe(6);
        expect(payload.data.skippedDueToBudget).toBe(6);
    });

    it("rejects unauthenticated pause mutation without changing config", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({
            session: null,
            error: new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            }),
        } as never);

        const request = new Request("http://localhost/api/intelligence/status", {
            method: "POST",
            body: JSON.stringify({ action: "pause" }),
        });
        const response = await POST(toNextRequest(request));

        expect(response.status).toBe(401);
        expect(prisma.intelligenceConfig.upsert).not.toHaveBeenCalled();
    });

    it("pauses live SCM crawling through an authenticated mutation", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.upsert).mockResolvedValueOnce(mockConfig(false) as never);

        const request = new Request("http://localhost/api/intelligence/status", {
            method: "POST",
            body: JSON.stringify({ action: "pause" }),
        });
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.killSwitch).toBe(true);
        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "default" },
            update: expect.objectContaining({ liveScmEnabled: false }),
        }));
    });

    it("resumes live SCM crawling through an authenticated mutation", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);
        vi.mocked(prisma.intelligenceConfig.upsert).mockResolvedValueOnce(mockConfig(true) as never);

        const request = new Request("http://localhost/api/intelligence/status", {
            method: "POST",
            body: JSON.stringify({ action: "resume" }),
        });
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.killSwitch).toBe(false);
        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "default" },
            update: expect.objectContaining({ liveScmEnabled: true }),
        }));
    });

    it("rejects invalid mutation action without changing config", async () => {
        vi.mocked(requireAuth).mockResolvedValueOnce({ session: { user: { steamId: "123" } }, error: null } as never);

        const request = new Request("http://localhost/api/intelligence/status", {
            method: "POST",
            body: JSON.stringify({ action: "restart" }),
        });
        const response = await POST(toNextRequest(request));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.success).toBe(false);
        expect(prisma.intelligenceConfig.upsert).not.toHaveBeenCalled();
    });
});
