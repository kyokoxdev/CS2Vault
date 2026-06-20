import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
    AegisActionStatus,
    AegisApprovalStatus,
    AegisRunStatus,
    AppendAegisLogInput,
    AppendAegisTraceInput,
    CreateAegisActionInput,
    CreateAegisApprovalInput,
    CreateAegisRunInput,
} from "./types";

const EMPTY_JSON = {} satisfies Prisma.InputJsonObject;
const MAX_SEQUENCE_RETRIES = 5;

function isUniqueConflict(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function nextTraceSequence(runId: string) {
    const result = await prisma.aegisTrace.aggregate({
        where: { runId },
        _max: { sequence: true },
    });

    return (result._max.sequence ?? 0) + 1;
}

async function nextLogSequence(runId: string) {
    const result = await prisma.aegisLog.aggregate({
        where: { runId },
        _max: { sequence: true },
    });

    return (result._max.sequence ?? 0) + 1;
}

export async function createAegisRun(input: CreateAegisRunInput) {
    return prisma.aegisRun.create({
        data: {
            userId: input.userId,
            sessionId: input.sessionId,
            input: input.input,
            provider: input.provider,
            agentMode: input.agentMode,
            reasoningDepth: input.reasoningDepth,
            openRouterModelId: input.openRouterModelId,
            deepResearch: input.deepResearch ?? false,
        },
    });
}

export async function getAegisRunForUser(runId: string, userId: string) {
    return prisma.aegisRun.findFirst({
        where: { id: runId, userId },
        include: {
            actions: { orderBy: { createdAt: "asc" }, include: { approval: true } },
            approvals: { orderBy: { createdAt: "asc" } },
            traces: { orderBy: { sequence: "asc" } },
        },
    });
}

export async function listAegisRunsForUser(userId: string, take = 20) {
    return prisma.aegisRun.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            status: true,
            sessionId: true,
            provider: true,
            agentMode: true,
            input: true,
            finalResponse: true,
            error: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
        },
    });
}

export async function transitionAegisRun(runId: string, userId: string, status: AegisRunStatus) {
    const now = new Date();
    return prisma.aegisRun.update({
        where: { id_userId: { id: runId, userId } },
        data: {
            status,
            ...(status === "running" ? { startedAt: now } : {}),
            ...(["completed", "failed", "cancelled"].includes(status) ? { completedAt: now } : {}),
        },
    });
}

export async function completeAegisRun(runId: string, userId: string, finalResponse: string) {
    return prisma.aegisRun.update({
        where: { id_userId: { id: runId, userId } },
        data: {
            status: "completed",
            finalResponse,
            completedAt: new Date(),
        },
    });
}

export async function failAegisRun(runId: string, userId: string, error: string) {
    return prisma.aegisRun.update({
        where: { id_userId: { id: runId, userId } },
        data: {
            status: "failed",
            error,
            completedAt: new Date(),
        },
    });
}

export async function appendAegisTrace(input: AppendAegisTraceInput) {
    for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt++) {
        const sequence = await nextTraceSequence(input.runId);
        try {
            return await prisma.aegisTrace.create({
                data: {
                    runId: input.runId,
                    userId: input.userId,
                    sequence,
                    stage: input.stage,
                    type: input.type,
                    message: input.message,
                    payload: input.payload ?? EMPTY_JSON,
                    error: input.error,
                },
            });
        } catch (error) {
            if (!isUniqueConflict(error) || attempt === MAX_SEQUENCE_RETRIES - 1) {
                throw error;
            }
        }
    }

    throw new Error("Failed to append Aegis trace after sequence retries.");
}

export async function listAegisTraces(runId: string, userId: string, afterSequence = 0) {
    return prisma.aegisTrace.findMany({
        where: {
            runId,
            userId,
            sequence: { gt: afterSequence },
        },
        orderBy: { sequence: "asc" },
    });
}

export async function appendAegisLog(input: AppendAegisLogInput) {
    for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt++) {
        const sequence = await nextLogSequence(input.runId);
        try {
            return await prisma.aegisLog.create({
                data: {
                    runId: input.runId,
                    userId: input.userId,
                    sequence,
                    stage: input.stage,
                    level: input.level ?? "info",
                    type: input.type,
                    message: input.message,
                    payload: input.payload ?? EMPTY_JSON,
                    error: input.error,
                },
            });
        } catch (error) {
            if (!isUniqueConflict(error) || attempt === MAX_SEQUENCE_RETRIES - 1) {
                throw error;
            }
        }
    }

    throw new Error("Failed to append Aegis log after sequence retries.");
}

export async function createAegisAction(input: CreateAegisActionInput) {
    if (input.idempotencyKey) {
        const existing = await prisma.aegisAction.findUnique({
            where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
            include: { approval: true },
        });

        if (existing) {
            return existing;
        }
    }

    try {
        return await prisma.aegisAction.create({
            data: {
                runId: input.runId,
                userId: input.userId,
                tool: input.tool,
                status: input.status ?? "proposed",
                risk: input.risk ?? "low",
                input: input.input ?? EMPTY_JSON,
                inputPreview: input.inputPreview,
                output: input.output ?? EMPTY_JSON,
                outputPreview: input.outputPreview,
                idempotencyKey: input.idempotencyKey,
            },
            include: { approval: true },
        });
    } catch (error) {
        if (!input.idempotencyKey || !isUniqueConflict(error)) {
            throw error;
        }

        const existing = await prisma.aegisAction.findUnique({
            where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
            include: { approval: true },
        });
        if (!existing) {
            throw error;
        }

        return existing;
    }
}

export async function getAegisActionForUser(actionId: string, userId: string) {
    return prisma.aegisAction.findUnique({
        where: { id_userId: { id: actionId, userId } },
        include: { approval: true, run: true },
    });
}

export async function updateAegisActionStatus(actionId: string, userId: string, status: AegisActionStatus, data: {
    output?: Prisma.InputJsonValue;
    outputPreview?: string;
    error?: string;
} = {}) {
    const now = new Date();
    return prisma.aegisAction.update({
        where: { id_userId: { id: actionId, userId } },
        data: {
            status,
            output: data.output,
            outputPreview: data.outputPreview,
            error: data.error,
            ...(status === "approved" ? { approvedAt: now } : {}),
            ...(["succeeded", "failed"].includes(status) ? { executedAt: now } : {}),
        },
        include: { approval: true },
    });
}

export async function markAegisActionRunning(actionId: string, userId: string) {
    return prisma.aegisAction.updateMany({
        where: {
            id: actionId,
            userId,
            status: { in: ["proposed", "approved"] },
        },
        data: { status: "running" },
    });
}

export async function createAegisApproval(input: CreateAegisApprovalInput) {
    return prisma.aegisApproval.create({
        data: {
            runId: input.runId,
            actionId: input.actionId,
            userId: input.userId,
            request: input.request ?? EMPTY_JSON,
            expiresAt: input.expiresAt,
        },
    });
}

export async function getPendingApprovalForAction(actionId: string, userId: string) {
    return prisma.aegisApproval.findFirst({
        where: {
            actionId,
            userId,
            status: "pending",
        },
        include: { action: true },
    });
}

export async function decideAegisApproval(approvalId: string, userId: string, status: Extract<AegisApprovalStatus, "approved" | "rejected">, response: Prisma.InputJsonValue = EMPTY_JSON) {
    return prisma.aegisApproval.update({
        where: { id_userId: { id: approvalId, userId } },
        data: {
            status,
            response,
            respondedAt: new Date(),
        },
        include: { action: true },
    });
}
