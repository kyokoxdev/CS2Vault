import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export interface AegisMemoryInput {
    title: string;
    content: string;
    kind?: string;
    tags?: string[];
    source?: string;
    confidence?: number;
}

export function hashMemoryContent(content: string) {
    return crypto.createHash("sha256").update(content.trim().toLowerCase()).digest("hex");
}

function normalizeTags(tags: string[] | undefined): Prisma.InputJsonValue {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

export async function listAegisMemories(userId: string, includeArchived = false) {
    return prisma.aegisMemory.findMany({
        where: {
            userId,
            ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { updatedAt: "desc" },
        include: { embeddings: { select: { id: true, model: true, dimensions: true, createdAt: true } } },
    });
}

export async function getAegisMemoryForUser(memoryId: string, userId: string) {
    return prisma.aegisMemory.findFirst({
        where: { id: memoryId, userId },
        include: { embeddings: true },
    });
}

export async function createAegisMemory(userId: string, input: AegisMemoryInput) {
    const content = input.content.trim();
    const contentHash = hashMemoryContent(content);

    return prisma.aegisMemory.upsert({
        where: { userId_contentHash: { userId, contentHash } },
        create: {
            userId,
            title: input.title.trim() || "Aegis memory",
            content,
            kind: input.kind ?? "preference",
            tags: normalizeTags(input.tags),
            source: input.source ?? "chat",
            confidence: input.confidence ?? 0.5,
            contentHash,
        },
        update: {
            title: input.title.trim() || "Aegis memory",
            content,
            kind: input.kind ?? "preference",
            tags: normalizeTags(input.tags),
            source: input.source ?? "chat",
            confidence: input.confidence ?? 0.5,
            archivedAt: null,
        },
    });
}

export async function updateAegisMemory(userId: string, memoryId: string, input: Partial<AegisMemoryInput>) {
    const existing = await getAegisMemoryForUser(memoryId, userId);
    if (!existing) throw new Error("Aegis memory not found.");

    const content = input.content?.trim() ?? existing.content;
    const contentHash = hashMemoryContent(content);

    return prisma.aegisMemory.update({
        where: { id: existing.id },
        data: {
            ...(input.title !== undefined ? { title: input.title.trim() || "Aegis memory" } : {}),
            ...(input.content !== undefined ? { content, contentHash } : {}),
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
            ...(input.source !== undefined ? { source: input.source } : {}),
            ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        },
    });
}

export async function archiveAegisMemory(userId: string, memoryId: string) {
    const existing = await getAegisMemoryForUser(memoryId, userId);
    if (!existing) throw new Error("Aegis memory not found.");

    return prisma.aegisMemory.update({
        where: { id: existing.id },
        data: { archivedAt: new Date() },
    });
}
