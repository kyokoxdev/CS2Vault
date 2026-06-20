import { appendAegisLog } from "../ledger";
import { embedAegisMemory } from "./embeddings";
import { createAegisMemory } from "./notebook";

const MAX_MEMORY_CONTENT_LENGTH = 1200;

function compactChatMemory(userMessage: string, assistantMessage: string) {
    const compact = [
        `User: ${userMessage.trim()}`,
        `Aegis: ${assistantMessage.trim()}`,
    ].join("\n");

    return compact.length > MAX_MEMORY_CONTENT_LENGTH
        ? `${compact.slice(0, MAX_MEMORY_CONTENT_LENGTH - 1)}…`
        : compact;
}

export async function extractAegisMemoryFromChat(input: {
    userId: string;
    runId?: string;
    sessionId?: string;
    userMessage: string;
    assistantMessage: string;
}) {
    if (!input.userMessage.trim() || !input.assistantMessage.trim()) return null;

    const memory = await createAegisMemory(input.userId, {
        title: input.userMessage.trim().slice(0, 80) || "Aegis chat memory",
        content: compactChatMemory(input.userMessage, input.assistantMessage),
        kind: "chat_summary",
        tags: ["chat", "auto"],
        source: input.sessionId ? `chat:${input.sessionId}` : "chat",
        confidence: 0.35,
    });

    try {
        await embedAegisMemory(memory.id, input.userId, input.runId);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to embed Aegis memory.";
        if (input.runId) {
            await appendAegisLog({
                runId: input.runId,
                userId: input.userId,
                type: "memory_embedding_error",
                level: "warn",
                message,
                error: message,
            });
        }
    }

    return memory;
}
