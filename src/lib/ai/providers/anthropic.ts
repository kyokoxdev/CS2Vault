import Anthropic from "@anthropic-ai/sdk";
import type { AIChatOptions, AIProvider, ChatMessageData, MarketContext } from "@/types";
import { prisma } from "@/lib/db";
import { decryptApiKey } from "@/lib/auth/api-keys";
import { buildSystemPrompt } from "@/lib/ai/prompt";

const ANTHROPIC_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AnthropicImageMediaType = typeof ANTHROPIC_IMAGE_MEDIA_TYPES[number];

function isAnthropicImageMediaType(value: string): value is AnthropicImageMediaType {
    return ANTHROPIC_IMAGE_MEDIA_TYPES.some((mediaType) => mediaType === value);
}

function parseImageDataUrl(imageBase64: string): { mediaType: AnthropicImageMediaType; data: string } | null {
    const match = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
    if (!match || !isAnthropicImageMediaType(match[1])) {
        return null;
    }

    return { mediaType: match[1], data: match[2] };
}

function buildAnthropicContent(message: ChatMessageData): Anthropic.MessageParam["content"] {
    if (!message.imageBase64) {
        return message.content;
    }

    const parsedImage = parseImageDataUrl(message.imageBase64);
    if (!parsedImage) {
        return `${message.content}\n\n[Attached image omitted: Claude supports JPEG, PNG, GIF, and WebP images.]`;
    }

    return [
        { type: "text", text: message.content },
        {
            type: "image",
            source: {
                type: "base64",
                media_type: parsedImage.mediaType,
                data: parsedImage.data,
            },
        },
    ];
}

function getEffort(depth: AIChatOptions["reasoningDepth"]): "low" | "medium" | "high" | "xhigh" | "max" {
    if (depth === "low" || depth === "medium" || depth === "high" || depth === "xhigh" || depth === "max") {
        return depth;
    }

    return "high";
}

export class AnthropicProvider implements AIProvider {
    name = "anthropic";
    requiresOAuth = false;

    async isAuthenticated(): Promise<boolean> {
        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        return !!(decryptApiKey(settings?.anthropicApiKey) || process.env.ANTHROPIC_API_KEY);
    }

    getModelName(): string {
        return process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
    }

    async *chat(messages: ChatMessageData[], context: MarketContext, options: AIChatOptions): AsyncGenerator<string> {
        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const apiKey = decryptApiKey(settings?.anthropicApiKey) || process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            throw new Error("Anthropic API key not configured. Add it in Settings.");
        }

        const client = new Anthropic({ apiKey });
        const anthropicMessages: Anthropic.MessageParam[] = messages
            .filter((message) => message.role !== "system")
            .map((message) => {
                const role: Anthropic.MessageParam["role"] = message.role === "assistant" ? "assistant" : "user";
                return {
                    role,
                    content: buildAnthropicContent(message),
                };
            });

        while (anthropicMessages.length > 0 && anthropicMessages[0].role === "assistant") {
            anthropicMessages.shift();
        }

        if (anthropicMessages.length === 0) {
            throw new Error("Claude needs at least one user message before it can respond.");
        }

        try {
            const stream = client.messages.stream({
                model: this.getModelName(),
                max_tokens: 64000,
                thinking: { type: "adaptive" },
                output_config: { effort: getEffort(options.reasoningDepth) },
                system: [
                    {
                        type: "text",
                        text: buildSystemPrompt(context, options),
                        cache_control: { type: "ephemeral" },
                    },
                ],
                messages: anthropicMessages,
            });

            for await (const event of stream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                    yield event.delta.text;
                }
            }

            await stream.finalMessage();
        } catch (error) {
            if (error instanceof Anthropic.AuthenticationError) {
                throw new Error("Invalid Anthropic API key. Please check your API key in Settings.");
            }

            if (error instanceof Anthropic.RateLimitError) {
                throw new Error("Anthropic rate limit exceeded. Please wait a moment and try again.");
            }

            if (error instanceof Anthropic.PermissionDeniedError) {
                throw new Error("Access denied. Your Anthropic API key may not have access to this model.");
            }

            if (error instanceof Anthropic.APIError) {
                throw new Error(`Anthropic error (${error.status}): ${error.message}`);
            }

            throw error;
        }
    }
}
