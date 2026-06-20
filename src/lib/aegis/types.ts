import type { Prisma } from "@/generated/prisma/client";
import type { AIAgentMode, AIProviderName, AIReasoningDepth } from "@/types";

export const AEGIS_TRACE_EVENT_TYPES = [
    "aegis.stage",
    "aegis.delta",
    "aegis.action_preview",
    "aegis.approval_required",
    "aegis.action_succeeded",
    "aegis.refetch",
    "aegis.error",
    "aegis.done",
] as const;

export const AEGIS_RUN_STATUSES = ["queued", "running", "waiting_approval", "completed", "failed", "cancelled"] as const;
export const AEGIS_ACTION_STATUSES = ["proposed", "waiting_approval", "approved", "rejected", "running", "succeeded", "failed"] as const;
export const AEGIS_APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export const AEGIS_TOOL_NAMES = ["portfolio.read", "portfolio.acquiredPrice.update", "watchlist.add"] as const;

export type AegisTraceEventType = typeof AEGIS_TRACE_EVENT_TYPES[number];
export type AegisRunStatus = typeof AEGIS_RUN_STATUSES[number];
export type AegisActionStatus = typeof AEGIS_ACTION_STATUSES[number];
export type AegisApprovalStatus = typeof AEGIS_APPROVAL_STATUSES[number];
export type AegisToolName = typeof AEGIS_TOOL_NAMES[number];
export type AegisJson = Prisma.InputJsonValue;

export interface CreateAegisRunInput {
    userId: string;
    sessionId?: string;
    input: string;
    provider?: AIProviderName;
    agentMode?: AIAgentMode;
    reasoningDepth?: AIReasoningDepth;
    openRouterModelId?: string;
    deepResearch?: boolean;
}

export interface AppendAegisTraceInput {
    runId: string;
    userId: string;
    type: AegisTraceEventType;
    stage?: string;
    message?: string;
    payload?: AegisJson;
    error?: string;
}

export interface AppendAegisLogInput {
    runId: string;
    userId: string;
    type: string;
    message: string;
    level?: "debug" | "info" | "warn" | "error";
    stage?: string;
    payload?: AegisJson;
    error?: string;
}

export interface CreateAegisActionInput {
    runId: string;
    userId: string;
    tool: AegisToolName;
    risk?: "low" | "edit";
    input?: AegisJson;
    inputPreview?: string;
    output?: AegisJson;
    outputPreview?: string;
    idempotencyKey?: string;
    status?: AegisActionStatus;
}

export interface CreateAegisApprovalInput {
    runId: string;
    actionId: string;
    userId: string;
    request?: AegisJson;
    expiresAt?: Date;
}

export interface AegisRunRequestedEvent {
    name: "aegis/run.requested";
    data: {
        runId: string;
        userId: string;
    };
}
