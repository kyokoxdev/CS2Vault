import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { chatWithFallback } from "@/lib/ai/registry";
import { initAIProviders } from "@/lib/ai/init";
import { buildMarketContext } from "@/lib/ai/context";
import { z } from "zod";
import type { ChatMessageData, AIProviderName } from "@/types";

const MAX_CONTENT_LENGTH = 4000;
const MAX_IMAGE_BASE64_LENGTH = 7_000_000; // ~5MB in base64
const MAX_MESSAGES = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
        imageBase64: z.string().max(MAX_IMAGE_BASE64_LENGTH).optional()
    })).min(1).max(MAX_MESSAGES),
    provider: z.enum(["gemini-pro", "gemini-flash", "openai"]).optional(),
});

initAIProviders();

// Per-user rate limiting (in-memory, resets on cold start)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(userId, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }

    entry.count++;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        if (!checkRateLimit(userId)) {
            return new Response("Rate limit exceeded. Please wait a moment before sending another message.", { status: 429 });
        }

        const body = await request.json();
        const { messages, provider } = ChatRequestSchema.parse(body);

        // Validate latest user message length (assistant messages in history can be longer)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === "user" && lastMsg.content.length > MAX_CONTENT_LENGTH) {
            return new Response("Message too long", { status: 400 });
        }

        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const preferredProvider = (provider ?? settings?.activeAIProvider ?? "gemini-pro") as AIProviderName;

        const latestUserMessage = messages[messages.length - 1];
        const hasImage = !!latestUserMessage.imageBase64;

        await prisma.chatMessage.create({
            data: {
                userId,
                role: "user",
                content: latestUserMessage.content,
                metadata: hasImage ? JSON.stringify({ hasImage: true }) : undefined,
            }
        });

        const context = await buildMarketContext(userId, latestUserMessage.content);
        context.userQuery = latestUserMessage.content;

        const aiGenerator = await chatWithFallback(preferredProvider, messages as ChatMessageData[], context);

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                let fullAssistantResponse = "";
                try {
                    for await (const chunk of aiGenerator) {
                        fullAssistantResponse += chunk;
                        controller.enqueue(encoder.encode(chunk));
                    }
                } catch (error) {
                    console.error("[AI Stream] Error:", error);
                    controller.enqueue(encoder.encode("\n\n*Error: An issue occurred while generating the response.*"));
                } finally {
                    controller.close();
                    if (fullAssistantResponse.trim()) {
                        await prisma.chatMessage.create({
                            data: {
                                userId,
                                role: "assistant",
                                content: fullAssistantResponse,
                                metadata: JSON.stringify({ provider: preferredProvider }),
                            }
                        }).catch(e => console.error("Failed to persist assistant message", e));
                    }
                }
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive"
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response("Invalid request format", { status: 400 });
        }
        console.error("[API /chat POST]", error);
        return new Response(error instanceof Error ? error.message : "Internal Server Error", { status: 500 });
    }
}
