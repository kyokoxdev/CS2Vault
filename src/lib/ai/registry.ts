/**
 * AI Provider Interface & Registry
 * 
 * Supports tiered providers:
 * 1. Gemini 3 Pro-Thinking (Google OAuth — premium)
 * 2. Gemini 2.5 Flash (free API key)
 * 3. OpenAI GPT-3.5 Turbo (free fallback)
 * 
 * Auto-fallback: if the active provider fails, try the next one.
 */

import type { AIProvider, AIProviderName, ChatMessageData, MarketContext } from "@/types";
import { isRateLimitError } from "@/lib/api-queue";

const providers = new Map<AIProviderName, AIProvider>();

// Fallback order: premium → free → emergency
const FALLBACK_ORDER: AIProviderName[] = ["gemini-pro", "gemini-flash", "openai"];

/**
 * Register an AI provider.
 */
export function registerAIProvider(
    name: AIProviderName,
    provider: AIProvider
): void {
    providers.set(name, provider);
}

/**
 * Get a specific AI provider by name.
 */
export function getAIProvider(name: AIProviderName): AIProvider | undefined {
    return providers.get(name);
}

/**
 * Get the best available AI provider, respecting the fallback chain.
 * If the preferred provider is unavailable or not authenticated,
 * falls back to the next one in the chain.
 */
export async function getActiveAIProvider(
    preferred: AIProviderName
): Promise<AIProvider> {
    // Try preferred first
    const preferredProvider = providers.get(preferred);
    if (preferredProvider) {
        try {
            if (!preferredProvider.requiresOAuth || (await preferredProvider.isAuthenticated())) {
                return preferredProvider;
            }
        } catch {
            console.warn(`[AI Registry] Preferred provider "${preferred}" auth check failed, trying fallbacks...`);
        }
    }

    // Fallback chain
    for (const name of FALLBACK_ORDER) {
        if (name === preferred) continue;
        const provider = providers.get(name);
        if (!provider) continue;
        try {
            if (!provider.requiresOAuth || (await provider.isAuthenticated())) {
                console.info(`[AI Registry] Falling back to "${name}"`);
                return provider;
            }
        } catch {
            continue;
        }
    }

    throw new Error("No AI provider is available. Configure at least one API key in settings.");
}

/**
 * Chat with automatic provider fallback.
 */
export async function* chatWithFallback(
    preferred: AIProviderName,
    messages: ChatMessageData[],
    context: MarketContext
): AsyncGenerator<string> {
    const triedProviders = new Set<AIProviderName>();

    const order: AIProviderName[] = [
        preferred,
        ...FALLBACK_ORDER.filter((n) => n !== preferred),
    ];

    for (const name of order) {
        if (triedProviders.has(name)) continue;
        triedProviders.add(name);

        const provider = providers.get(name);
        if (!provider) continue;

        try {
            const isAvailable = !provider.requiresOAuth || (await provider.isAuthenticated());
            if (!isAvailable) continue;
        } catch {
            continue;
        }

        try {
            yield* provider.chat(messages, context);
            return;
        } catch (error) {
            if (isRateLimitError(error)) {
                console.warn(
                    `[AI Registry] Provider "${name}" hit rate limit, trying next provider...`
                );
                continue;
            }
            throw error;
        }
    }

    throw new Error("All AI providers are rate-limited or unavailable. Please try again later.");
}

/**
 * Get all registered providers with their status.
 */
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
