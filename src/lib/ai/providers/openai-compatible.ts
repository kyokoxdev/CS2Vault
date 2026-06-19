import OpenAI from "openai";
import type { AIChatOptions, AIProvider, AIProviderName, ChatMessageData, MarketContext } from "@/types";
import { prisma } from "@/lib/db";
import { decryptApiKey } from "@/lib/auth/api-keys";
import { buildSystemPrompt } from "@/lib/ai/prompt";

interface OpenAICompatibleConfig {
    name: Extract<AIProviderName, "openrouter" | "9router">;
    displayName: string;
    apiKeyField: "openRouterApiKey" | "nineRouterApiKey";
    apiKeyEnv: string;
    baseUrlEnv: string;
    defaultBaseUrl: string;
    modelEnv: string;
    defaultModel: string;
    apiKeyRequired: boolean;
}

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, "");
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export class OpenAICompatibleProvider implements AIProvider {
    name: AIProviderName;
    requiresOAuth = false;

    constructor(private readonly config: OpenAICompatibleConfig) {
        this.name = config.name;
    }

    private getBaseUrl(): string {
        return normalizeBaseUrl(process.env[this.config.baseUrlEnv] || this.config.defaultBaseUrl);
    }

    private getModel(options?: AIChatOptions): string {
        if (this.config.name === "openrouter" && options?.openRouterModelId) {
            return options.openRouterModelId;
        }

        return process.env[this.config.modelEnv] || this.config.defaultModel;
    }

    private getConfiguredKey(settings: { openRouterApiKey?: string | null; nineRouterApiKey?: string | null } | null): string | undefined {
        const encrypted = this.config.apiKeyField === "openRouterApiKey"
            ? settings?.openRouterApiKey
            : settings?.nineRouterApiKey;
        return decryptApiKey(encrypted) || process.env[this.config.apiKeyEnv] || undefined;
    }

    async isAuthenticated(): Promise<boolean> {
        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const apiKey = this.getConfiguredKey(settings);
        return this.config.apiKeyRequired ? !!apiKey : true;
    }

    getModelName(): string {
        return this.getModel();
    }

    async *chat(messages: ChatMessageData[], context: MarketContext, options: AIChatOptions): AsyncGenerator<string> {
        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const apiKey = this.getConfiguredKey(settings);

        if (this.config.apiKeyRequired && !apiKey) {
            throw new Error(`${this.config.displayName} API key not configured. Add it in Settings.`);
        }

        const hasImage = messages.some((message) => message.imageBase64);
        if (hasImage) {
            yield `*Note: Image attachments are only analyzed by providers with explicit vision support. ${this.config.displayName} received the text conversation only.*\n\n`;
        }

        const client = new OpenAI({
            apiKey: apiKey || "not-needed",
            baseURL: this.getBaseUrl(),
        });

        const providerMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: buildSystemPrompt(context, options) },
            ...messages.filter((message) => message.role !== "system").map((message) => ({
                role: message.role,
                content: message.content,
            } as OpenAI.Chat.ChatCompletionMessageParam)),
        ];

        try {
            const stream = await client.chat.completions.create({
                model: this.getModel(options),
                messages: providerMessages,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                const status = error.status;
                const message = error.message || "Unknown provider error";

                if (status === 401) {
                    throw new Error(`Invalid ${this.config.displayName} API key. Check it in Settings.`);
                }

                if (status === 429) {
                    throw new Error(`${this.config.displayName} rate limit exceeded. Wait a moment and try again.`);
                }

                if (status === 503) {
                    throw new Error(`${this.config.displayName} is temporarily unavailable. Try again in a few moments.`);
                }

                throw new Error(`${this.config.displayName} error (${status}): ${message}`);
            }

            throw error;
        }
    }
}

export const openRouterProviderConfig: OpenAICompatibleConfig = {
    name: "openrouter",
    displayName: "OpenRouter",
    apiKeyField: "openRouterApiKey",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "openai/gpt-latest",
    apiKeyRequired: true,
};

export const nineRouterProviderConfig: OpenAICompatibleConfig = {
    name: "9router",
    displayName: "9Router",
    apiKeyField: "nineRouterApiKey",
    apiKeyEnv: "NINEROUTER_API_KEY",
    baseUrlEnv: "NINEROUTER_BASE_URL",
    defaultBaseUrl: "http://localhost:20128/v1",
    modelEnv: "NINEROUTER_MODEL",
    defaultModel: "cc/claude-opus-4-7",
    apiKeyRequired: false,
};
