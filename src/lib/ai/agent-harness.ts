import type { AIChatOptions, AIProviderName, ChatMessageData, MarketContext } from "@/types";
import { chatWithProvider } from "@/lib/ai/registry";

interface AegisAgentHarnessParams {
    provider: AIProviderName;
    messages: ChatMessageData[];
    context: MarketContext;
    options: AIChatOptions;
}

const RESEARCHER_STATUS = "*Researcher is reviewing the market packet...*\n\n";
const CONSULTANT_STATUS = "*Consultant is turning the research into a recommendation...*\n\n";

async function collectProviderResponse(
    provider: AIProviderName,
    messages: ChatMessageData[],
    context: MarketContext,
    options: AIChatOptions
): Promise<string> {
    let response = "";

    for await (const chunk of chatWithProvider(provider, messages, context, options)) {
        response += chunk;
    }

    return response.trim();
}

export async function* runAegisAgentHarness({
    provider,
    messages,
    context,
    options,
}: AegisAgentHarnessParams): AsyncGenerator<string> {
    if (options.agentMode === "researcher") {
        yield RESEARCHER_STATUS;
        yield* chatWithProvider(provider, messages, context, {
            ...options,
            agentMode: "researcher",
            agentStage: "researcher",
        });
        return;
    }

    yield RESEARCHER_STATUS;
    const delegatedResearch = await collectProviderResponse(provider, messages, context, {
        ...options,
        agentMode: "researcher",
        agentStage: "researcher",
        delegatedResearch: undefined,
    });

    yield CONSULTANT_STATUS;
    yield* chatWithProvider(provider, messages, context, {
        ...options,
        agentMode: "consultant",
        agentStage: "consultant-final",
        delegatedResearch,
    });
}

export function getAegisHarnessStages(agentMode: AIChatOptions["agentMode"]): string[] {
    return agentMode === "consultant" ? ["researcher", "consultant-final"] : ["researcher"];
}
