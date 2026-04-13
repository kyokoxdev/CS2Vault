/**
 * AI Provider Interface & Registry
 */

import type { AIProvider, AIProviderName, ChatMessageData, MarketContext } from "@/types";

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
    context: MarketContext
): AsyncGenerator<string> {
    const provider = providers.get(name);
    if (!provider) {
        throw new Error(`AI provider "${name}" is not registered.`);
    }

    if (provider.requiresOAuth && !(await provider.isAuthenticated())) {
        throw new Error(`AI provider "${name}" requires authentication. Connect it in Settings.`);
    }

    yield* provider.chat(messages, context);
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
