import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { getAIProvider } from "@/lib/ai/registry";
import { initAIProviders } from "@/lib/ai/init";
import { serializeAegisStreamEvent } from "@/lib/aegis/trace-events";
import { createAndDispatchAegisRun } from "@/lib/aegis/runs";
import {
    AI_AGENT_MODE_VALUES,
    AI_PROVIDER_VALUES,
    AI_REASONING_DEPTH_VALUES,
    getDefaultReasoningDepthForModel,
    getModelShortLabel,
    getReasoningDepthOptionsForModel,
    isAIProviderName,
    isReasoningDepthSupportedForModel,
} from "@/lib/ai/model-labels";
import { z } from "zod";

const MAX_CONTENT_LENGTH = 4000;
const MAX_IMAGE_BASE64_LENGTH = 7_000_000; // ~5MB in base64
const MAX_MESSAGES = 50;
const MAX_OPENROUTER_MODEL_ID_LENGTH = 160;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
        imageBase64: z.string()
            .max(MAX_IMAGE_BASE64_LENGTH)
            .regex(IMAGE_DATA_URL_PATTERN, "Unsupported image data URL")
            .optional()
    })).min(1).max(MAX_MESSAGES),
    provider: z.enum(AI_PROVIDER_VALUES).optional(),
    reasoningDepth: z.enum(AI_REASONING_DEPTH_VALUES).optional(),
    openRouterModelId: z.string().max(MAX_OPENROUTER_MODEL_ID_LENGTH).optional(),
    agentMode: z.enum(AI_AGENT_MODE_VALUES).default("consultant"),
    sessionId: z.string().optional(),
    deepResearch: z.boolean().optional(),
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

function normalizeOpenRouterModelId(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
        return undefined;
    }

    return trimmed;
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
        const { messages, provider, reasoningDepth, openRouterModelId, agentMode, sessionId, deepResearch } = ChatRequestSchema.parse(body);

        // Validate latest user message length (assistant messages in history can be longer)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === "user" && lastMsg.content.length > MAX_CONTENT_LENGTH) {
            return new Response("Message too long", { status: 400 });
        }

        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const settingsProvider = settings?.activeAIProvider;
        const preferredProvider = provider ?? (settingsProvider && isAIProviderName(settingsProvider) ? settingsProvider : "gemini-flash");
        const normalizedOpenRouterModelId = normalizeOpenRouterModelId(openRouterModelId);
        const reasoningOptions = getReasoningDepthOptionsForModel(preferredProvider);
        const normalizedReasoningDepth = reasoningOptions.length > 0
            ? reasoningDepth ?? getDefaultReasoningDepthForModel(preferredProvider)
            : undefined;

        if (openRouterModelId !== undefined && !normalizedOpenRouterModelId) {
            return NextResponse.json(
                { success: false, error: "OpenRouter model id cannot be empty or contain control characters." },
                { status: 400 }
            );
        }

        if (normalizedOpenRouterModelId && preferredProvider !== "openrouter") {
            return NextResponse.json(
                { success: false, error: "OpenRouter model selection is only available when OpenRouter is the active engine." },
                { status: 400 }
            );
        }

        if (reasoningDepth && reasoningOptions.length === 0) {
            return NextResponse.json(
                { success: false, error: `AI provider "${getModelShortLabel(preferredProvider)}" does not support reasoning depth selection.` },
                { status: 400 }
            );
        }

        if (normalizedReasoningDepth && !isReasoningDepthSupportedForModel(preferredProvider, normalizedReasoningDepth)) {
            return NextResponse.json(
                { success: false, error: `Reasoning depth "${normalizedReasoningDepth}" is not supported by ${getModelShortLabel(preferredProvider)}.` },
                { status: 400 }
            );
        }

        const latestUserMessage = messages[messages.length - 1];
        const hasImage = !!latestUserMessage.imageBase64;

        const providerInstance = getAIProvider(preferredProvider);
        if (!providerInstance) {
            return NextResponse.json(
                { success: false, error: `AI provider "${getModelShortLabel(preferredProvider)}" is not available.` },
                { status: 400 }
            );
        }

        try {
            if (providerInstance.requiresOAuth && !(await providerInstance.isAuthenticated())) {
                return NextResponse.json(
                    { success: false, error: `AI provider "${getModelShortLabel(preferredProvider)}" requires authentication. Connect it in Settings.` },
                    { status: 401 }
                );
            }
        } catch (error) {
            console.error("[AI Provider Auth] Error:", error);
            return NextResponse.json(
                { success: false, error: "Failed to validate AI provider authentication." },
                { status: 500 }
            );
        }

        const configuredProvider = preferredProvider;
        if (!providerInstance.requiresOAuth) {
            try {
                const isAvailable = await providerInstance.isAuthenticated();
                if (!isAvailable) {
                    return NextResponse.json(
                        { success: false, error: `AI provider "${getModelShortLabel(configuredProvider)}" is missing an API key. Configure it in Settings.` },
                        { status: 400 }
                    );
                }
            } catch (error) {
                console.error("[AI Provider Config] Error:", error);
            }
        }

        let validatedSessionId: string | undefined;
        if (sessionId) {
            const ownedSession = await prisma.chatSession.findFirst({
                where: { id: sessionId, userId },
                select: { id: true },
            });
            if (!ownedSession) {
                return NextResponse.json(
                    { success: false, error: "Chat session not found." },
                    { status: 404 }
                );
            }
            validatedSessionId = ownedSession.id;
        }

        await prisma.chatMessage.create({
            data: {
                userId,
                sessionId: validatedSessionId,
                role: "user",
                content: latestUserMessage.content,
                metadata: hasImage ? JSON.stringify({ hasImage: true }) : undefined,
            }
        });

        if (validatedSessionId) {
            const sessionMsgCount = await prisma.chatMessage.count({
                where: { sessionId: validatedSessionId, userId, role: "user" },
            });
            const updateData: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
            if (sessionMsgCount === 1) {
                updateData.title = latestUserMessage.content.slice(0, 80) || "New Chat";
            }
            const updateResult = await prisma.chatSession.updateMany({
                where: { id: validatedSessionId, userId },
                data: updateData,
            });
            if (updateResult.count === 0) {
                console.error("[API /chat POST] Validated chat session was not updated", { sessionId: validatedSessionId, userId });
            }
        }

        const aegisRun = await createAndDispatchAegisRun({
            userId,
            sessionId: validatedSessionId,
            input: latestUserMessage.content,
            provider: preferredProvider,
            agentMode,
            reasoningDepth: normalizedReasoningDepth,
            openRouterModelId: normalizedOpenRouterModelId,
            deepResearch: deepResearch ?? false,
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode(serializeAegisStreamEvent({
                    type: "aegis.stage",
                    sequence: 1,
                    stage: "queued",
                    message: "Aegis chat run queued.",
                    payload: { runId: aegisRun.id },
                })));
                controller.close();
            },
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
            return NextResponse.json(
                { success: false, error: "Invalid request format" },
                { status: 400 }
            );
        }
        console.error("[API /chat POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
