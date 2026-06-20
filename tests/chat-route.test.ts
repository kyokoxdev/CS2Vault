import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

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
            findFirst: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
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
    detectAegisWatchlistAction: vi.fn(),
}));

vi.mock("@/lib/ai/deep-research", () => ({
    performDeepResearch: vi.fn(),
}));

vi.mock("@/lib/aegis/ledger", () => ({
    appendAegisTrace: vi.fn(async () => ({ sequence: 1 })),
    completeAegisRun: vi.fn(),
    createAegisRun: vi.fn(async () => ({ id: "run-1" })),
    failAegisRun: vi.fn(),
    transitionAegisRun: vi.fn(),
}));

vi.mock("@/lib/aegis/actions/executor", () => ({
    executeAegisAction: vi.fn(),
    proposeAegisAction: vi.fn(),
}));

vi.mock("@/lib/aegis/memory/extract", () => ({
    extractAegisMemoryFromChat: vi.fn(),
}));

vi.mock("@/lib/aegis/runs", () => ({
    createAndDispatchAegisRun: vi.fn(async () => ({ id: "run-1" })),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { getAIProvider } from "@/lib/ai/registry";
import { runAegisAgentHarness } from "@/lib/ai/agent-harness";
import { createAndDispatchAegisRun } from "@/lib/aegis/runs";
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
        vi.mocked(prisma.chatSession.findFirst).mockResolvedValue({ id: "session-1" } as never);
        vi.mocked(prisma.chatSession.update).mockResolvedValue({} as never);
        vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);
        vi.mocked(prisma.chatSession.findMany).mockResolvedValue([] as never);
        vi.mocked(getAIProvider).mockReturnValue({
            name: "Gemini",
            requiresOAuth: false,
            isAuthenticated: vi.fn().mockResolvedValue(true),
            chat: vi.fn(),
            getModelName: vi.fn(() => "Gemini"),
        } as never);
        vi.mocked(createAndDispatchAegisRun).mockResolvedValue({ id: "run-1" } as never);
    });

    it("rejects a chat request for a session owned by another user", async () => {
        vi.mocked(prisma.chatSession.findFirst).mockResolvedValueOnce(null as never);
        const response = await POST(toNextRequest(new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: "Add @item[AWP | Asiimov] to the watchlist" }],
                provider: "gemini-flash",
                agentMode: "consultant",
                sessionId: "foreign-session",
            }),
        })));

        expect(response.status).toBe(404);
        expect(prisma.chatMessage.create).not.toHaveBeenCalled();
        expect(createAndDispatchAegisRun).not.toHaveBeenCalled();
    });

    it("persists the user message and dispatches a durable Aegis run", async () => {
        const response = await POST(toNextRequest(new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: "Analyze my watchlist" }],
                provider: "gemini-flash",
                agentMode: "consultant",
                sessionId: "session-1",
            }),
        })));

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("run-1");
        expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({
            where: { id: "session-1", userId: "user-1" },
            select: { id: true },
        });
        expect(prisma.chatMessage.count).toHaveBeenCalledWith({
            where: { sessionId: "session-1", userId: "user-1", role: "user" },
        });
        expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "session-1", userId: "user-1" },
        }));
        expect(createAndDispatchAegisRun).toHaveBeenCalledWith(expect.objectContaining({
            userId: "user-1",
            sessionId: "session-1",
            input: "Analyze my watchlist",
            provider: "gemini-flash",
            agentMode: "consultant",
        }));
        expect(runAegisAgentHarness).not.toHaveBeenCalled();
    });
});
