import { registerAIProvider } from "./registry";
import { GeminiProProvider } from "./providers/gemini-pro";
import { GeminiFlashProvider } from "./providers/gemini-flash";
import { OpenAIProvider } from "./providers/openai";

let initialized = false;

export function initAIProviders() {
    if (initialized) return;

    registerAIProvider("gemini-pro", new GeminiProProvider());
    registerAIProvider("gemini-flash", new GeminiFlashProvider());
    registerAIProvider("openai", new OpenAIProvider());

    console.log("[AI] Providers initialized and registered in fallback chain");
    initialized = true;
}
