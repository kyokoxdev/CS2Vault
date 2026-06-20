import { prisma } from "@/lib/db";
import { buildMarketContext } from "@/lib/ai/context";
import { getAegisHarnessStages, runAegisAgentHarness } from "@/lib/ai/agent-harness";
import { performDeepResearch } from "@/lib/ai/deep-research";
import { detectAegisWatchlistAction } from "@/lib/ai/watchlist-actions";
import { extractAegisMemoryFromChat } from "@/lib/aegis/memory/extract";
import type { AIChatOptions, AIProviderName, ChatMessageData } from "@/types";
import { appendAegisLog, appendAegisTrace, completeAegisRun, failAegisRun } from "./ledger";
import { executeAegisAction, proposeAegisAction } from "./actions/executor";
import { detectAegisCostBasisIntent } from "./actions/cost-basis-detector";
import { AegisStreamBuffer } from "./stream-buffer";

const MAX_DURABLE_MESSAGES = 50;

function normalizeProvider(provider: string | null): AIProviderName {
    if (provider === "openai" || provider === "anthropic" || provider === "openrouter" || provider === "9router") {
        return provider;
    }

    return "gemini-flash";
}

async function loadRunMessages(runId: string, userId: string): Promise<ChatMessageData[]> {
    const run = await prisma.aegisRun.findUnique({ where: { id_userId: { id: runId, userId } } });
    if (!run) throw new Error("Aegis run not found.");

    if (!run.sessionId) {
        return [{ role: "user", content: run.input }];
    }

    const messages = await prisma.chatMessage.findMany({
        where: {
            userId,
            sessionId: run.sessionId,
            role: { in: ["user", "assistant"] },
            createdAt: { lte: run.createdAt },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_DURABLE_MESSAGES,
        select: { role: true, content: true },
    });

    if (messages.length === 0) {
        return [{ role: "user", content: run.input }];
    }

    const chronologicalMessages = messages.toReversed().map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
    }));
    const lastMessage = chronologicalMessages.at(-1);
    if (lastMessage?.role === "user" && lastMessage.content === run.input) {
        return chronologicalMessages;
    }

    return [...chronologicalMessages, { role: "user" as const, content: run.input }].slice(-MAX_DURABLE_MESSAGES);
}

async function loadReferencedSessionContext(userId: string, message: string): Promise<string | undefined> {
    const userSessions = await prisma.chatSession.findMany({
        where: { userId },
        select: { id: true, title: true },
    });
    const referencedSession = userSessions.find((session) => message.includes(session.id));
    if (!referencedSession) return undefined;

    const referencedMessages = await prisma.chatMessage.findMany({
        where: { sessionId: referencedSession.id, userId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, createdAt: true },
    });
    if (referencedMessages.length === 0) return undefined;

    let formattedHistory = `=== REFERENCED CHAT SESSION (ID: ${referencedSession.id}, Title: "${referencedSession.title}") ===\n`;
    for (const message of referencedMessages) {
        const sender = message.role === "user" ? "User" : "Aegis";
        formattedHistory += `[${message.createdAt.toISOString()}] ${sender}: ${message.content}\n`;
    }
    formattedHistory += "=== END REFERENCED CHAT SESSION ===";

    return formattedHistory;
}

async function handleWatchlistAction(runId: string, userId: string, message: string) {
    try {
        const watchlistAction = await detectAegisWatchlistAction(message);
        if (!watchlistAction) return undefined;

        if (watchlistAction.status !== "added" || !watchlistAction.itemId) {
            return watchlistAction;
        }

        const action = await proposeAegisAction({
            runId,
            userId,
            tool: "watchlist.add",
            input: { itemId: watchlistAction.itemId },
            idempotencyKey: `run:${runId}:watchlist.add:${watchlistAction.itemId}`,
        });
        await executeAegisAction(action.id, userId);

        return {
            status: "added" as const,
            itemName: watchlistAction.itemName,
            message: watchlistAction.message,
        };
    } catch (error) {
        const messageText = error instanceof Error ? error.message : "Watchlist action failed.";
        await appendAegisLog({
            runId,
            userId,
            type: "watchlist_action_error",
            level: "warn",
            message: messageText,
            error: messageText,
        });
        await appendAegisTrace({
            runId,
            userId,
            type: "aegis.error",
            stage: "tools",
            message: "I couldn't update the global Watchlist right now, but I can still answer normally.",
            error: messageText,
        });

        return {
            status: "failed" as const,
            message: "I couldn't update the global Watchlist right now, but I can still answer normally.",
        };
    }
}

async function proposeCostBasisAction(runId: string, userId: string, message: string) {
    const intent = await detectAegisCostBasisIntent(userId, message);
    if (!intent) return;

    await proposeAegisAction({
        runId,
        userId,
        tool: "portfolio.acquiredPrice.update",
        input: {
            inventoryItemId: intent.inventoryItemId,
            acquiredPrice: intent.acquiredPrice,
        },
        idempotencyKey: `run:${runId}:portfolio.acquiredPrice.update:${intent.inventoryItemId}:${intent.acquiredPrice}`,
    });
}

export async function runDurableAegis(runId: string, userId: string) {
    const run = await prisma.aegisRun.findUnique({ where: { id_userId: { id: runId, userId } } });
    if (!run) throw new Error("Aegis run not found.");

    const provider = normalizeProvider(run.provider);
    const agentMode = run.agentMode === "researcher" ? "researcher" : "consultant";
    const messages = await loadRunMessages(runId, userId);
    const latestUserMessage = messages.findLast((message) => message.role === "user")?.content ?? run.input;
    const context = await buildMarketContext(userId, latestUserMessage);
    context.userQuery = latestUserMessage;

    try {
        context.referencedSessionContext = await loadReferencedSessionContext(userId, latestUserMessage);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Referenced chat context failed.";
        await appendAegisLog({ runId, userId, type: "referenced_session_error", level: "warn", message, error: message });
    }

    const watchlistAction = await handleWatchlistAction(runId, userId, latestUserMessage);
    if (watchlistAction) {
        context.watchlistAction = watchlistAction;
    }

    await proposeCostBasisAction(runId, userId, latestUserMessage);

    let deepResearchBlock: string | undefined;
    if (run.deepResearch) {
        await appendAegisTrace({
            runId,
            userId,
            type: "aegis.stage",
            stage: "research",
            message: "*Searching online sources...*\n\n",
        });

        try {
            const research = await performDeepResearch(latestUserMessage);
            deepResearchBlock = research.contextBlock;
            await appendAegisTrace({
                runId,
                userId,
                type: "aegis.stage",
                stage: "research",
                message: "*Reading and synthesizing web pages...*\n\n",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Deep research failed.";
            await appendAegisLog({
                runId,
                userId,
                type: "deep_research_error",
                level: "warn",
                message,
                error: message,
            });
            await appendAegisTrace({
                runId,
                userId,
                type: "aegis.error",
                stage: "research",
                message: "*Search failed, proceeding with model knowledge...*\n\n",
                error: message,
            });
        }
    }

    const options: AIChatOptions = {
        agentMode,
        ...(run.reasoningDepth ? { reasoningDepth: run.reasoningDepth as AIChatOptions["reasoningDepth"] } : {}),
        ...(run.openRouterModelId ? { openRouterModelId: run.openRouterModelId } : {}),
        ...(run.deepResearch ? { deepResearch: true } : {}),
        ...(deepResearchBlock ? { deepResearchBlock } : {}),
    };
    const buffer = new AegisStreamBuffer({ runId, userId, stage: "harness" });

    try {
        const generator = runAegisAgentHarness({ provider, messages, context, options });
        for await (const chunk of generator) {
            await buffer.append(chunk);
        }

        const finalResponse = buffer.text();
        await completeAegisRun(runId, userId, finalResponse);
        await appendAegisTrace({
            runId,
            userId,
            type: "aegis.done",
            stage: "harness",
            message: "Aegis response completed.",
        });

        if (finalResponse.trim()) {
            await prisma.chatMessage.create({
                data: {
                    userId,
                    sessionId: run.sessionId ?? undefined,
                    role: "assistant",
                    content: finalResponse,
                    metadata: JSON.stringify({
                        provider,
                        ...(run.openRouterModelId ? { openRouterModelId: run.openRouterModelId } : {}),
                        ...(run.reasoningDepth ? { reasoningDepth: run.reasoningDepth } : {}),
                        agentMode,
                        harness: "aegis",
                        stages: getAegisHarnessStages(agentMode),
                        durableRunId: runId,
                        ...(run.deepResearch ? { deepResearch: true } : {}),
                    }),
                },
            });
            try {
                await extractAegisMemoryFromChat({
                    userId,
                    runId,
                    sessionId: run.sessionId ?? undefined,
                    userMessage: latestUserMessage,
                    assistantMessage: finalResponse,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "Aegis memory extraction failed.";
                await appendAegisLog({
                    runId,
                    userId,
                    type: "memory_extract_error",
                    level: "warn",
                    message,
                    error: message,
                });
            }
        }

        return { finalResponse };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Aegis runner failed.";
        await appendAegisLog({
            runId,
            userId,
            type: "runner_error",
            level: "error",
            message,
            error: message,
        });
        await appendAegisTrace({
            runId,
            userId,
            type: "aegis.error",
            stage: "harness",
            message,
            error: message,
        });
        await failAegisRun(runId, userId, message);
        throw error;
    }
}
