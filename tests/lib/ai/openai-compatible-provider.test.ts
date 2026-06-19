import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider, nineRouterProviderConfig, openRouterProviderConfig } from "@/lib/ai/providers/openai-compatible";
import { prisma } from "@/lib/db";
import type { ChatMessageData, MarketContext } from "@/types";

const openAiCreateMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
    class MockOpenAI {
        static APIError = class APIError extends Error {
            status?: number;
        };

        chat = {
            completions: {
                create: openAiCreateMock,
            },
        };
    }

    return { default: MockOpenAI };
});

vi.mock("@/lib/db", () => ({
    prisma: {
        appSettings: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/api-keys", () => ({
    decryptApiKey: vi.fn(() => undefined),
}));

vi.mock("@/lib/ai/prompt", () => ({
    buildSystemPrompt: vi.fn(() => "system prompt"),
}));

const context: MarketContext = {
    topGainers: [],
    topLosers: [],
    userQuery: "Analyze this item",
};

const messages: ChatMessageData[] = [
    { role: "user", content: "Analyze this item" },
];

async function* streamResponse(): AsyncGenerator<{ choices: { delta: { content: string } }[] }> {
    yield { choices: [{ delta: { content: "ok" } }] };
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
    let output = "";
    for await (const chunk of generator) {
        output += chunk;
    }
    return output;
}

describe("OpenAICompatibleProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
        vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);
        openAiCreateMock.mockResolvedValue(streamResponse());
    });

    it("uses the selected OpenRouter model id for OpenRouter requests", async () => {
        const provider = new OpenAICompatibleProvider(openRouterProviderConfig);

        await expect(collect(provider.chat(messages, context, {
            agentMode: "consultant",
            openRouterModelId: "openai/gpt-oss-120b",
        }))).resolves.toBe("ok");

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "openai/gpt-oss-120b",
            stream: true,
        }));
    });

    it("does not apply the OpenRouter model override to 9Router", async () => {
        const provider = new OpenAICompatibleProvider(nineRouterProviderConfig);

        await collect(provider.chat(messages, context, {
            agentMode: "consultant",
            openRouterModelId: "openai/gpt-oss-120b",
        }));

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "cc/claude-opus-4-7",
        }));
    });
});
