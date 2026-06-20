import { prisma } from "@/lib/db";
import { AEGIS_EMBEDDING_MODEL, generateAegisEmbedding } from "./embeddings";

function parseVector(vectorJson: string) {
    const value = JSON.parse(vectorJson) as unknown;
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function cosineSimilarity(left: number[], right: number[]) {
    const length = Math.min(left.length, right.length);
    if (length === 0) return 0;

    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < length; index++) {
        dot += left[index] * right[index];
        leftMagnitude += left[index] * left[index];
        rightMagnitude += right[index] * right[index];
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function searchAegisMemories(userId: string, query: string, limit = 5) {
    const queryVector = await generateAegisEmbedding(query);
    if (!queryVector) return [];

    const embeddings = await prisma.aegisEmbedding.findMany({
        where: {
            userId,
            model: AEGIS_EMBEDDING_MODEL,
            memory: { archivedAt: null },
        },
        include: { memory: true },
    });

    return embeddings
        .map((embedding) => ({
            memory: embedding.memory,
            score: cosineSimilarity(queryVector, parseVector(embedding.vectorJson)),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
}

export async function listRecentAegisMemories(userId: string, limit = 5) {
    return prisma.aegisMemory.findMany({
        where: { userId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: limit,
    });
}
