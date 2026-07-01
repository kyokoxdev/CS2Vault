import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { buildScmBudgetSummary } from "@/lib/market/intelligence/budget";
import { getQueueSummary } from "@/lib/market/intelligence/queue";

type IntelligenceStatusConfig = {
    id: string;
    liveScmEnabled: boolean;
    circuitBreakerUntil: Date | null;
    consecutiveProviderFailures: number;
    lastRunAt: Date | null;
    lastError: string | null;
    requestBudget: unknown;
};

type QueueSummary = Awaited<ReturnType<typeof getQueueSummary>>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveSkippedDueToBudget(config: IntelligenceStatusConfig, queueSummary: QueueSummary, now: Date): number {
    if (!isRecord(config.requestBudget)) return 0;

    const remainingDue = queueSummary.pending + queueSummary.backoff;
    if (remainingDue === 0) return 0;

    const minuteStartedAt = typeof config.requestBudget.scmMinuteStartedAt === "string"
        ? new Date(config.requestBudget.scmMinuteStartedAt)
        : null;
    const dayStartedAt = typeof config.requestBudget.scmDayStartedAt === "string"
        ? new Date(config.requestBudget.scmDayStartedAt)
        : null;
    const minuteFresh = minuteStartedAt !== null && Number.isFinite(minuteStartedAt.getTime()) && now.getTime() - minuteStartedAt.getTime() < 60_000;
    const dayFresh = dayStartedAt !== null && Number.isFinite(dayStartedAt.getTime()) && now.toISOString().slice(0, 10) === dayStartedAt.toISOString().slice(0, 10);
    const minuteCount = minuteFresh ? numberValue(config.requestBudget.scmMinuteCount) ?? 0 : 0;
    const dayCount = dayFresh ? numberValue(config.requestBudget.scmDayCount) ?? 0 : 0;

    return minuteCount >= 19 || dayCount >= 950 ? remainingDue : 0;
}

function buildStatusPayload(config: IntelligenceStatusConfig | null, queueSummary: QueueSummary, now: Date) {
    const remainingDue = queueSummary.pending + queueSummary.backoff;
    const oldestDueAgeMinutes = queueSummary.oldestDueAgeMs !== null
        ? Math.round(queueSummary.oldestDueAgeMs / 60_000)
        : null;

    if (!config) {
        return {
            initialized: false,
            killSwitch: true,
            circuitBreaker: { active: false, until: null, consecutiveFailures: 0 },
            queue: { pending: 0, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMinutes: null },
            processed: null,
            skippedDueToBudget: null,
            remainingDue: 0,
            lastRunAt: null,
            nextRecommendedPingAt: null,
            lastError: null,
            scmBudget: buildScmBudgetSummary({}, now),
        };
    }

    const circuitBreakerActive = config.circuitBreakerUntil !== null && config.circuitBreakerUntil.getTime() > now.getTime();
    const killSwitchEnabled = !config.liveScmEnabled;

    let nextRecommendedPingAt: string | null = null;
    if (!killSwitchEnabled && !circuitBreakerActive) {
        if (queueSummary.oldestDueAt) {
            nextRecommendedPingAt = new Date(Math.min(queueSummary.oldestDueAt.getTime(), now.getTime() + 30 * 60 * 1000)).toISOString();
        } else {
            nextRecommendedPingAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
        }
    }

    return {
        initialized: true,
        killSwitch: killSwitchEnabled,
        circuitBreaker: {
            active: circuitBreakerActive,
            until: config.circuitBreakerUntil?.toISOString() ?? null,
            consecutiveFailures: config.consecutiveProviderFailures,
        },
        queue: {
            pending: queueSummary.pending,
            running: queueSummary.running,
            backoff: queueSummary.backoff,
            disabled: queueSummary.disabled,
            oldestDueAt: queueSummary.oldestDueAt?.toISOString() ?? null,
            oldestDueAgeMinutes,
        },
        processed: null,
        skippedDueToBudget: deriveSkippedDueToBudget(config, queueSummary, now),
        remainingDue,
        lastRunAt: config.lastRunAt?.toISOString() ?? null,
        nextRecommendedPingAt,
        lastError: config.lastError,
        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
    };
}

export async function GET() {
    try {
        const authResult = await requireAuth();
        if (authResult.error) {
            return authResult.error;
        }

        const now = new Date();

        const [config, queueSummary] = await Promise.all([
            prisma.intelligenceConfig.upsert({
                where: { id: "default" },
                update: {},
                create: { id: "default", liveScmEnabled: false },
                select: {
                    id: true,
                    liveScmEnabled: true,
                    circuitBreakerUntil: true,
                    consecutiveProviderFailures: true,
                    lastRunAt: true,
                    lastError: true,
                    requestBudget: true,
                },
            }),
            getQueueSummary(now),
        ]);

        return NextResponse.json({
            success: true,
            data: buildStatusPayload(config, queueSummary, now),
        });
    } catch (error) {
        console.error("[IntelligenceRoute /status]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Failed to fetch intelligence status" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuth();
        if (authResult.error) {
            return authResult.error;
        }

        const body = await request.json().catch(() => ({}));
        const action = typeof body.action === "string" ? body.action : "";

        if (action !== "pause" && action !== "resume") {
            return NextResponse.json(
                { success: false, status: "error", error: "Invalid intelligence status action" },
                { status: 400 }
            );
        }

        const liveScmEnabled = action === "resume";
        const now = new Date();

        const [config, queueSummary] = await Promise.all([
            prisma.intelligenceConfig.upsert({
                where: { id: "default" },
                update: { liveScmEnabled },
                create: { id: "default", liveScmEnabled },
                select: {
                    id: true,
                    liveScmEnabled: true,
                    circuitBreakerUntil: true,
                    consecutiveProviderFailures: true,
                    lastRunAt: true,
                    lastError: true,
                    requestBudget: true,
                },
            }),
            getQueueSummary(now),
        ]);

        return NextResponse.json({
            success: true,
            data: buildStatusPayload(config, queueSummary, now),
        });
    } catch (error) {
        console.error("[IntelligenceRoute /status]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Failed to update intelligence status" },
            { status: 500 }
        );
    }
}
