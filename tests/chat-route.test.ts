import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { MarketContext } from "@/types";

vi.mock("@/lib/db", () => ({
    prisma: {
        appSettings: {
            findUnique: vi.fn(),
        },
        chatMessage: {
            create: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn(),
        },
        chatSession: {
            update: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("@/lib/ai/registry", () => ({
    getAIProvider: vi.fn(),
}));

vi.mock("@/lib/ai/init", () => ({
    initAIProviders: vi.fn(),
}));

vi.mock("@/lib/ai/context", () => ({
    buildMarketContext: vi.fn(),
}));

vi.mock("@/lib/ai/agent-harness", () => ({
    getAegisHarnessStages: vi.fn(() => ["researcher", "consultant-final"]),
    runAegisAgentHarness: vi.fn(async function* () {
        yield "normal answer";
    }),
}));

vi.mock("@/lib/ai/watchlist-actions", () => ({
    maybeHandleAegisWatchlistAction: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { getAIProvider } from "@/lib/ai/registry";
import { buildMarketContext } from "@/lib/ai/context";
import { runAegisAgentHarness } from "@/lib/ai/agent-harness";
import { maybeHandleAegisWatchlistAction } from "@/lib/ai/watchlist-actions";
import { POST } from "@/app/api/chat/route";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

describe("POST /api/chat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            session: { user: { id: "user-1" } },
            error: null,
        } as never);
        vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null as never);
        vi.mocked(prisma.chatMessage.create).mockResolvedValue({} as never);
        vi.mocked(prisma.chatMessage.count).mockResolvedValue(1 as never);
        vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.chatSession.update).mockResolvedValue({} as never);
        vi.mocked(prisma.chatSession.findMany).mockResolvedValue([] as never);
        vi.mocked(getAIProvider).mockReturnValue({
            name: "Gemini",
            requiresOAuth: false,
            isAuthenticated: vi.fn().mockResolvedValue(true),
            chat: vi.fn(),
            getModelName: vi.fn(() => "Gemini"),
        } as never);
        vi.mocked(buildMarketContext).mockResolvedValue({
            topGainers: [],
            topLosers: [],
            userQuery: "",
        } satisfies MarketContext as never);
    });

    it("continues normal chat when the deterministic watchlist action fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(maybeHandleAegisWatchlistAction).mockRejectedValueOnce(new Error("database unavailable"));

        const response = await POST(toNextRequest(new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: "Add @item[AWP | Asiimov] to the watchlist" }],
                provider: "gemini-flash",
                agentMode: "consultant",
            }),
        })));

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("normal answer");
        expect(runAegisAgentHarness).toHaveBeenCalledWith(expect.objectContaining({
            context: expect.objectContaining({
                watchlistAction: expect.objectContaining({ status: "failed" }),
            }),
        }));
        expect(consoleError).toHaveBeenCalledWith("[Aegis Watchlist Action]", expect.any(Error));

        consoleError.mockRestore();
    });
});
