import { NextRequest, NextResponse } from "next/server";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";
import { prisma } from "@/lib/db";

const DEFAULT_RUN_LIMIT = 10;
const MIN_RUN_LIMIT = 1;
const MAX_RUN_LIMIT = 10;
const DEFAULT_BUDGET_MS = 28_000;
const MIN_BUDGET_MS = 1_000;
const MAX_BUDGET_MS = 28_000;
const MIN_REMAINING_MS_TO_START_JOB = 12_000;

function isCronAuthorized(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;

    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) return true;

    const cronHeader = request.headers.get("x-cron-secret");
    if (cronHeader === cronSecret) return true;

    return false;
}

function parseClampedInteger(value: string | null, fallback: number, min: number, max: number): number {
    if (value === null) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;

    return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
    try {
        if (!isCronAuthorized(request)) {
            return NextResponse.json(
                { success: false, status: "error", error: "Unauthorized — invalid or missing CRON_SECRET" },
                { status: 401 }
            );
        }

        const config = await prisma.intelligenceConfig.findUnique({
            where: { id: "default" },
            select: {
                liveScmEnabled: true,
                circuitBreakerUntil: true,
                lastRunAt: true,
            },
        });

        if (!config) {
            return NextResponse.json(
                { success: false, status: "error", error: "Intelligence config not found" },
                { status: 500 }
            );
        }

        const now = new Date();

        if (!config.liveScmEnabled) {
            return NextResponse.json({
                success: true,
                data: {
                    status: "paused",
                    processed: 0,
                    skippedDueToBudget: 0,
                    remainingDue: 0,
                    oldestDueAgeMinutes: null,
                    circuitBreaker: {
                        active: config.circuitBreakerUntil !== null && new Date(config.circuitBreakerUntil).getTime() > now.getTime(),
                        until: config.circuitBreakerUntil?.toISOString() ?? null,
                    },
                    killSwitch: true,
                    lastRunAt: config.lastRunAt?.toISOString() ?? null,
                    nextRecommendedPingAt: null,
                },
            });
        }

        const circuitBreakerActive = config.circuitBreakerUntil !== null && new Date(config.circuitBreakerUntil).getTime() > now.getTime();
        if (circuitBreakerActive) {
            return NextResponse.json({
                success: true,
                data: {
                    status: "backoff",
                    processed: 0,
                    skippedDueToBudget: 0,
                    remainingDue: 0,
                    oldestDueAgeMinutes: null,
                    circuitBreaker: {
                        active: true,
                        until: config.circuitBreakerUntil!.toISOString(),
                    },
                    killSwitch: false,
                    lastRunAt: config.lastRunAt?.toISOString() ?? null,
                    nextRecommendedPingAt: config.circuitBreakerUntil!.toISOString(),
                },
            });
        }

        const searchParams = new URL(request.url).searchParams;
        const perRunCap = parseClampedInteger(searchParams.get("limit"), DEFAULT_RUN_LIMIT, MIN_RUN_LIMIT, MAX_RUN_LIMIT);
        const budgetMs = parseClampedInteger(searchParams.get("budgetMs"), DEFAULT_BUDGET_MS, MIN_BUDGET_MS, MAX_BUDGET_MS);
        const result = await runIntelligenceQueue({
            perRunCap,
            budgetMs,
            minRemainingMsToStartJob: MIN_REMAINING_MS_TO_START_JOB,
        });
        const refreshedConfig = await prisma.intelligenceConfig.findUnique({
            where: { id: "default" },
            select: {
                circuitBreakerUntil: true,
                lastRunAt: true,
            },
        });

        const remainingDue = (result.summary?.pending ?? 0) + (result.summary?.backoff ?? 0);
        const oldestDueAgeMinutes = result.summary?.oldestDueAgeMs !== null && result.summary?.oldestDueAgeMs !== undefined
            ? Math.round(result.summary.oldestDueAgeMs / 60_000)
            : null;

        let nextRecommendedPingAt: string | null = null;
        if (result.summary?.oldestDueAt) {
            nextRecommendedPingAt = new Date(Math.min(
                result.summary.oldestDueAt.getTime(),
                now.getTime() + 30 * 60 * 1000
            )).toISOString();
        } else {
            nextRecommendedPingAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
        }

        return NextResponse.json({
            success: true,
            data: {
                status: result.status,
                reason: result.reason,
                processed: result.processed,
                skippedDueToBudget: result.skippedDueToBudget,
                timeBudgetExceeded: result.timeBudgetExceeded,
                budgetMs: result.budgetMs,
                elapsedMs: result.elapsedMs,
                remainingMs: result.remainingMs,
                requestedLimit: result.requestedLimit,
                effectiveLimit: result.effectiveLimit,
                remainingDue,
                oldestDueAgeMinutes,
                circuitBreaker: {
                    active: result.circuitBreakerOpened || (refreshedConfig?.circuitBreakerUntil !== null && refreshedConfig?.circuitBreakerUntil !== undefined && refreshedConfig.circuitBreakerUntil.getTime() > now.getTime()),
                    until: refreshedConfig?.circuitBreakerUntil?.toISOString() ?? null,
                },
                killSwitch: false,
                lastRunAt: refreshedConfig?.lastRunAt?.toISOString() ?? now.toISOString(),
                nextRecommendedPingAt,
            },
        });
    } catch (error) {
        console.error("[IntelligenceRoute /run]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Intelligence run failed" },
            { status: 500 }
        );
    }
}
