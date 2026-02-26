import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { chatWithFallback } from "@/lib/ai/registry";
import { initAIProviders } from "@/lib/ai/init";
import { buildMarketContext } from "@/lib/ai/context";
import { z } from "zod";
import type { ChatMessageData, AIProviderName } from "@/types";

const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
        imageBase64: z.string().optional()
    })).min(1),
    provider: z.enum(["gemini-pro", "gemini-flash", "openai"]).optional(),
});

// Initialize providers exactly once
initAIProviders();

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        let userId: string | undefined;

        if (session?.user?.id) {
            userId = session.user.id;
        } else if (process.env.NODE_ENV === "development") {
            const firstUser = await prisma.user.findFirst();
            if (firstUser) userId = firstUser.id;
        }

        if (!userId) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { messages, provider } = ChatRequestSchema.parse(body);

        // Get preferred provider from settings
        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const preferredProvider = (provider as AIProviderName) || (settings?.activeAIProvider as AIProviderName) || "gemini-pro";

        const latestUserMessage = messages[messages.length - 1];

        // Persist user's latest message IMMEDIATELY (history is already loaded via client)
        await prisma.chatMessage.create({
            data: {
                userId,
                role: "user",
                content: latestUserMessage.content,
            }
        });

        // Build context
        const context = await buildMarketContext(userId, latestUserMessage.content);
        context.userQuery = latestUserMessage.content;

        // Get the async generator from our registry
        const aiGenerator = await chatWithFallback(preferredProvider, messages as ChatMessageData[], context);

        const encoder = new TextEncoder();

        // Create a ReadableStream that consumes the async generator
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
                    // Persist the full assistant message after stream ends!
                    if (fullAssistantResponse.trim()) {
                        await prisma.chatMessage.create({
                            data: {
                                userId: userId!,
                                role: "assistant",
                                content: fullAssistantResponse,
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
