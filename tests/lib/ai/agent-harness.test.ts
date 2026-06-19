import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAegisHarnessStages, runAegisAgentHarness } from "@/lib/ai/agent-harness";
import { chatWithProvider } from "@/lib/ai/registry";
import type { AIChatOptions, ChatMessageData, MarketContext } from "@/types";

vi.mock("@/lib/ai/registry", () => ({
    chatWithProvider: vi.fn(),
}));

const context: MarketContext = {
    topGainers: [],
    topLosers: [],
    userQuery: "Should I buy this item?",
};

const messages: ChatMessageData[] = [
    { role: "user", content: "Should I buy this item?" },
];

async function* streamChunks(chunks: string[]): AsyncGenerator<string> {
    for (const chunk of chunks) {
        yield chunk;
    }
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
    let output = "";
    for await (const chunk of generator) {
        output += chunk;
    }
    return output;
}

describe("runAegisAgentHarness", () => {
    beforeEach(() => {
        vi.mocked(chatWithProvider).mockReset();
    });

    it("runs Researcher mode as one streamed provider call", async () => {
        const options: AIChatOptions = { agentMode: "researcher", reasoningDepth: "high" };
        vi.mocked(chatWithProvider).mockReturnValue(streamChunks(["Research finding."]));

        const output = await collect(runAegisAgentHarness({
            provider: "gemini-flash",
            messages,
            context,
            options,
        }));

        expect(output).toBe("*Researcher is reviewing the market packet...*\n\nResearch finding.");
        expect(chatWithProvider).toHaveBeenCalledTimes(1);
        expect(chatWithProvider).toHaveBeenCalledWith("gemini-flash", messages, context, {
            agentMode: "researcher",
            agentStage: "researcher",
            reasoningDepth: "high",
        });
    });

    it("runs Consultant mode as Researcher collection before Consultant streaming", async () => {
        const callOptions: AIChatOptions[] = [];
        vi.mocked(chatWithProvider).mockImplementation((_provider, _messages, _context, options) => {
            callOptions.push(options);
            return callOptions.length === 1
                ? streamChunks(["Liquidity thin. ", "Momentum improving."])
                : streamChunks(["Final recommendation."]);
        });

        const output = await collect(runAegisAgentHarness({
            provider: "anthropic",
            messages,
            context,
            options: { agentMode: "consultant", reasoningDepth: "high" },
        }));

        expect(output).toBe("*Researcher is reviewing the market packet...*\n\n*Consultant is turning the research into a recommendation...*\n\nFinal recommendation.");
        expect(chatWithProvider).toHaveBeenCalledTimes(2);
        expect(callOptions[0]).toMatchObject({
            agentMode: "researcher",
            agentStage: "researcher",
            reasoningDepth: "high",
        });
        expect(callOptions[1]).toMatchObject({
            agentMode: "consultant",
            agentStage: "consultant-final",
            delegatedResearch: "Liquidity thin. Momentum improving.",
            reasoningDepth: "high",
        });
    });

    it("preserves the selected OpenRouter model across staged provider calls", async () => {
        const callOptions: AIChatOptions[] = [];
        vi.mocked(chatWithProvider).mockImplementation((_provider, _messages, _context, options) => {
            callOptions.push(options);
            return callOptions.length === 1
                ? streamChunks(["Research."])
                : streamChunks(["Final."]);
        });

        await collect(runAegisAgentHarness({
            provider: "openrouter",
            messages,
            context,
            options: {
                agentMode: "consultant",
                openRouterModelId: "openai/gpt-oss-120b",
            },
        }));

        expect(callOptions[0]).toMatchObject({
            agentMode: "researcher",
            agentStage: "researcher",
            openRouterModelId: "openai/gpt-oss-120b",
        });
        expect(callOptions[1]).toMatchObject({
            agentMode: "consultant",
            agentStage: "consultant-final",
            delegatedResearch: "Research.",
            openRouterModelId: "openai/gpt-oss-120b",
        });
    });

    it("reports the static stages used for metadata", () => {
        expect(getAegisHarnessStages("researcher")).toEqual(["researcher"]);
        expect(getAegisHarnessStages("consultant")).toEqual(["researcher", "consultant-final"]);
    });
});
