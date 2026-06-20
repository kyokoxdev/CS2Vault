import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findRun: vi.fn(),
    findMessages: vi.fn(),
    createChatMessage: vi.fn(),
    findSessions: vi.fn(),
    buildMarketContext: vi.fn(),
    runHarness: vi.fn(),
    appendLog: vi.fn(),
    appendTrace: vi.fn(),
    completeRun: vi.fn(),
    failRun: vi.fn(),
    detectWatchlist: vi.fn(),
    detectCostBasis: vi.fn(),
    extractMemory: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    prisma: {
        aegisRun: { findUnique: mocks.findRun },
        chatMessage: { findMany: mocks.findMessages, create: mocks.createChatMessage },
        chatSession: { findMany: mocks.findSessions },
    },
}));

vi.mock("@/lib/ai/context", () => ({
    buildMarketContext: mocks.buildMarketContext,
}));

vi.mock("@/lib/ai/agent-harness", () => ({
    getAegisHarnessStages: vi.fn(() => ["consultant-final"]),
    runAegisAgentHarness: mocks.runHarness,
}));

vi.mock("@/lib/ai/deep-research", () => ({
    performDeepResearch: vi.fn(),
}));

vi.mock("@/lib/ai/watchlist-actions", () => ({
    detectAegisWatchlistAction: mocks.detectWatchlist,
}));

vi.mock("@/lib/aegis/memory/extract", () => ({
    extractAegisMemoryFromChat: mocks.extractMemory,
}));

vi.mock("@/lib/aegis/ledger", () => ({
    appendAegisLog: mocks.appendLog,
    appendAegisTrace: mocks.appendTrace,
    completeAegisRun: mocks.completeRun,
    failAegisRun: mocks.failRun,
}));

vi.mock("@/lib/aegis/actions/executor", () => ({
    executeAegisAction: vi.fn(),
    proposeAegisAction: vi.fn(),
}));

vi.mock("@/lib/aegis/actions/cost-basis-detector", () => ({
    detectAegisCostBasisIntent: mocks.detectCostBasis,
}));

import { runDurableAegis } from "@/lib/aegis/runner";

describe("runDurableAegis", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.findRun.mockResolvedValue({
            id: "run-1",
            userId: "user-1",
            sessionId: "session-1",
            input: "latest prompt",
            createdAt: new Date("2026-06-20T12:00:00.000Z"),
            provider: "gemini-flash",
            agentMode: "consultant",
            reasoningDepth: null,
            openRouterModelId: null,
            deepResearch: false,
        });
        mocks.findSessions.mockResolvedValue([]);
        mocks.buildMarketContext.mockResolvedValue({});
        mocks.detectWatchlist.mockResolvedValue(null);
        mocks.detectCostBasis.mockResolvedValue(null);
        mocks.runHarness.mockImplementation(async function* () {
            yield "assistant response";
        });
    });

    it("uses the newest bounded session history and keeps the run input as the final user prompt", async () => {
        mocks.findMessages.mockResolvedValue(
            Array.from({ length: 50 }, (_, index) => ({
                role: index % 2 === 0 ? "assistant" : "user",
                content: `historical message ${index}`,
            })),
        );

        await runDurableAegis("run-1", "user-1");

        expect(mocks.findMessages).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 50,
        }));
        const harnessInput = mocks.runHarness.mock.calls[0]?.[0];
        expect(harnessInput.messages).toHaveLength(50);
        expect(harnessInput.messages.at(-1)).toEqual({ role: "user", content: "latest prompt" });
        expect(mocks.buildMarketContext).toHaveBeenCalledWith("user-1", "latest prompt");
    });
});
