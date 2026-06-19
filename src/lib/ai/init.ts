import { registerAIProvider } from "./registry";
import { GeminiFlashProvider } from "./providers/gemini-flash";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAICompatibleProvider, nineRouterProviderConfig, openRouterProviderConfig } from "./providers/openai-compatible";

let initialized = false;

export function initAIProviders() {
    if (initialized) return;

    registerAIProvider("gemini-flash", new GeminiFlashProvider());
    registerAIProvider("openai", new OpenAIProvider());
    registerAIProvider("anthropic", new AnthropicProvider());
    registerAIProvider("openrouter", new OpenAICompatibleProvider(openRouterProviderConfig));
    registerAIProvider("9router", new OpenAICompatibleProvider(nineRouterProviderConfig));

    console.log("[AI] Providers initialized");
    initialized = true;
}
