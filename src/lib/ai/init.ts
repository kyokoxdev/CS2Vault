import { registerAIProvider } from "./registry";
import { GeminiFlashProvider } from "./providers/gemini-flash";
import { OpenAIProvider } from "./providers/openai";

let initialized = false;

export function initAIProviders() {
    if (initialized) return;

    registerAIProvider("gemini-flash", new GeminiFlashProvider());
    registerAIProvider("openai", new OpenAIProvider());

    console.log("[AI] Providers initialized");
    initialized = true;
}
