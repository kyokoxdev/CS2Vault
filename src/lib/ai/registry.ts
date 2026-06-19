/**
 * AI Provider Interface & Registry
 */

import type { AIChatOptions, AIProvider, AIProviderName, ChatMessageData, MarketContext } from "@/types";
import { getModelShortLabel } from "./model-labels";

const providers = new Map<AIProviderName, AIProvider>();

export function registerAIProvider(
    name: AIProviderName,
    provider: AIProvider
): void {
    providers.set(name, provider);
}

export function getAIProvider(name: AIProviderName): AIProvider | undefined {
    return providers.get(name);
}

export async function* chatWithProvider(
    name: AIProviderName,
    messages: ChatMessageData[],
    context: MarketContext,
    options: AIChatOptions
): AsyncGenerator<string> {
    const provider = providers.get(name);
    if (!provider) {
        throw new Error(`AI provider "${getModelShortLabel(name)}" is not registered.`);
    }

    if (provider.requiresOAuth && !(await provider.isAuthenticated())) {
        throw new Error(`AI provider "${getModelShortLabel(name)}" requires authentication. Connect it in Settings.`);
    }

    yield* provider.chat(messages, context, options);
}

export async function getProviderStatuses(): Promise<
    { name: AIProviderName; modelName: string; available: boolean; requiresOAuth: boolean }[]
> {
    const statuses = [];
    for (const [name, provider] of providers) {
        let available = false;
        try {
            available = !provider.requiresOAuth || (await provider.isAuthenticated());
        } catch {
            available = false;
        }
        statuses.push({
            name,
            modelName: provider.getModelName(),
            available,
            requiresOAuth: provider.requiresOAuth,
        });
    }
    return statuses;
}
