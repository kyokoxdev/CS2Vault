import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { decryptApiKey } from "@/lib/auth/api-keys";
import { appendAegisLog, appendAegisTrace } from "../ledger";
import { hashMemoryContent } from "./notebook";

export const AEGIS_EMBEDDING_MODEL = "gemini-embedding-2";
export const AEGIS_EMBEDDING_DIMENSIONS = 1536;

async function resolveAegisGeminiKey() {
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    return decryptApiKey(settings?.geminiApiKey);
}

async function logEmbeddingUnavailable(userId: string, runId: string | undefined, message: string) {
    if (!runId) return;

    await appendAegisLog({
        runId,
        userId,
        type: "embedding_unavailable",
        level: "warn",
        message,
    });
    await appendAegisTrace({
        runId,
        userId,
        type: "aegis.error",
        stage: "memory",
        message,
        error: message,
    });
}

export async function generateAegisEmbedding(content: string) {
    const apiKey = await resolveAegisGeminiKey();
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
        model: AEGIS_EMBEDDING_MODEL,
        contents: content,
        config: { outputDimensionality: AEGIS_EMBEDDING_DIMENSIONS },
    });

    const values = response.embeddings?.[0]?.values;
    return values && values.length > 0 ? values : null;
}

export async function embedAegisMemory(memoryId: string, userId: string, runId?: string) {
    const memory = await prisma.aegisMemory.findFirst({ where: { id: memoryId, userId } });
    if (!memory) throw new Error("Aegis memory not found.");

    const apiKey = await resolveAegisGeminiKey();
    if (!apiKey) {
        await logEmbeddingUnavailable(userId, runId, "Gemini API key is required for Aegis memory embeddings.");
        return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
        model: AEGIS_EMBEDDING_MODEL,
        contents: memory.content,
        config: { outputDimensionality: AEGIS_EMBEDDING_DIMENSIONS },
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
        await logEmbeddingUnavailable(userId, runId, "Gemini did not return an embedding for this Aegis memory.");
        return null;
    }

    return prisma.aegisEmbedding.upsert({
        where: {
            memoryId_model_contentHash: {
                memoryId: memory.id,
                model: AEGIS_EMBEDDING_MODEL,
                contentHash: memory.contentHash ?? hashMemoryContent(memory.content),
            },
        },
        create: {
            memoryId: memory.id,
            userId,
            provider: "gemini",
            model: AEGIS_EMBEDDING_MODEL,
            dimensions: values.length,
            vectorJson: JSON.stringify(values),
            contentHash: memory.contentHash ?? hashMemoryContent(memory.content),
            metadata: { outputDimensionality: AEGIS_EMBEDDING_DIMENSIONS },
        },
        update: {
            dimensions: values.length,
            vectorJson: JSON.stringify(values),
            metadata: { outputDimensionality: AEGIS_EMBEDDING_DIMENSIONS },
        },
    });
}
