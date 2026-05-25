import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { buildScmBudgetSummary, hasScmBudget, SCM_CRON_PER_RUN_CAP } from "@/lib/market/intelligence/budget";
import { promoteStaleSignalQueueItems } from "@/lib/market/intelligence/queue";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";

const DEFAULT_RUN_LIMIT = SCM_CRON_PER_RUN_CAP;
const DEFAULT_BUDGET_MS = 28_000;
const MIN_REMAINING_MS_TO_START_JOB = 12_000;
let refreshInFlight = false;

const EMPTY_LANES = {
    scmHot: { candidates: 0, claimed: 0, processed: 0, succeeded: 0, failed: 0, skippedDueToBudget: 0, itemIds: [] as string[] },
    scmDiscovery: { candidates: 0, claimed: 0, processed: 0, succeeded: 0, failed: 0, skippedDueToBudget: 0, itemIds: [] as string[] },
    csfloatScout: { candidates: 0, processed: 0, failed: 0, itemIds: [] as string[] },
};

function oldestDueAgeMinutes(summary: { oldestDueAgeMs?: number | null } | undefined): number | null {
    if (summary?.oldestDueAgeMs === null || summary?.oldestDueAgeMs === undefined) return null;
    return Math.round(summary.oldestDueAgeMs / 60_000);
}

function nextRecommendedPingAt(summary: { oldestDueAt?: Date | null } | undefined, now: Date): string {
    if (summary?.oldestDueAt) {
        return new Date(Math.min(summary.oldestDueAt.getTime(), now.getTime() + 30 * 60 * 1000)).toISOString();
    }

    return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
}

export async function POST() {
    try {
        const authResult = await requireAuth();
        if (authResult.error) {
            return authResult.error;
        }

        if (refreshInFlight) {
            return NextResponse.json({
                success: true,
                data: {
                    status: "running",
                    reason: "refresh_in_progress",
                    promoted: 0,
                    candidateSignals: 0,
                    candidateQueueItems: 0,
                    refreshedItemIds: [],
                    processed: 0,
                    claimed: 0,
                    succeeded: 0,
                    failed: 0,
                    skippedDueToBudget: 0,
                    scmValidatedCount: 0,
                    csfloatCandidateCount: 0,
                    stalePromotionCount: 0,
                    stalePromotedItemIds: [],
                    lanes: EMPTY_LANES,
                    remainingDue: 0,
                    oldestDueAgeMinutes: null,
                    circuitBreaker: { active: false, until: null },
                    killSwitch: false,
                        lastRunAt: null,
                        nextRecommendedPingAt: null,
                        scmBudget: buildScmBudgetSummary({}, new Date()),
                    },
                });
        }

        refreshInFlight = true;

        try {
            const config = await prisma.intelligenceConfig.findUnique({
                where: { id: "default" },
                select: {
                    liveScmEnabled: true,
                    circuitBreakerUntil: true,
                    lastRunAt: true,
                    requestBudget: true,
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
                        promoted: 0,
                        candidateSignals: 0,
                        candidateQueueItems: 0,
                        refreshedItemIds: [],
                        processed: 0,
                        claimed: 0,
                        succeeded: 0,
                        failed: 0,
                        skippedDueToBudget: 0,
                        scmValidatedCount: 0,
                        csfloatCandidateCount: 0,
                        stalePromotionCount: 0,
                        stalePromotedItemIds: [],
                        lanes: EMPTY_LANES,
                        remainingDue: 0,
                        oldestDueAgeMinutes: null,
                        circuitBreaker: { active: false, until: null },
                        killSwitch: true,
                        lastRunAt: config.lastRunAt?.toISOString() ?? null,
                        nextRecommendedPingAt: null,
                        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
                    },
                });
            }

            const circuitBreakerActive = config.circuitBreakerUntil !== null && config.circuitBreakerUntil.getTime() > now.getTime();
            if (circuitBreakerActive) {
                return NextResponse.json({
                    success: true,
                    data: {
                        status: "backoff",
                        promoted: 0,
                        candidateSignals: 0,
                        candidateQueueItems: 0,
                        refreshedItemIds: [],
                        processed: 0,
                        claimed: 0,
                        succeeded: 0,
                        failed: 0,
                        skippedDueToBudget: 0,
                        scmValidatedCount: 0,
                        csfloatCandidateCount: 0,
                        stalePromotionCount: 0,
                        stalePromotedItemIds: [],
                        lanes: EMPTY_LANES,
                        remainingDue: 0,
                        oldestDueAgeMinutes: null,
                        circuitBreaker: { active: true, until: config.circuitBreakerUntil!.toISOString() },
                        killSwitch: false,
                        lastRunAt: config.lastRunAt?.toISOString() ?? null,
                        nextRecommendedPingAt: config.circuitBreakerUntil!.toISOString(),
                        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
                    },
                });
            }

            const runningQueueItems = await prisma.intelligenceQueueItem.count({
                where: {
                    status: "running",
                    OR: [{ lockedUntil: null }, { lockedUntil: { gt: now } }],
                },
            });
            if (runningQueueItems > 0) {
                return NextResponse.json({
                    success: true,
                    data: {
                        status: "running",
                        reason: "queue_items_running",
                        promoted: 0,
                        candidateSignals: 0,
                        candidateQueueItems: 0,
                        refreshedItemIds: [],
                        processed: 0,
                        claimed: 0,
                        succeeded: 0,
                        failed: 0,
                        skippedDueToBudget: 0,
                        scmValidatedCount: 0,
                        csfloatCandidateCount: 0,
                        stalePromotionCount: 0,
                        stalePromotedItemIds: [],
                        lanes: EMPTY_LANES,
                        remainingDue: 0,
                        oldestDueAgeMinutes: null,
                        circuitBreaker: { active: false, until: null },
                        killSwitch: false,
                        lastRunAt: config.lastRunAt?.toISOString() ?? null,
                        nextRecommendedPingAt: null,
                        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
                    },
                });
            }

            if (!hasScmBudget(config.requestBudget, now)) {
                return NextResponse.json({
                    success: true,
                    data: {
                        status: "skipped",
                        reason: "scm_budget_exhausted",
                        promoted: 0,
                        candidateSignals: 0,
                        candidateQueueItems: 0,
                        refreshedItemIds: [],
                        processed: 0,
                        claimed: 0,
                        succeeded: 0,
                        failed: 0,
                        skippedDueToBudget: 0,
                        scmValidatedCount: 0,
                        csfloatCandidateCount: 0,
                        stalePromotionCount: 0,
                        stalePromotedItemIds: [],
                        lanes: EMPTY_LANES,
                        remainingDue: 0,
                        oldestDueAgeMinutes: null,
                        circuitBreaker: { active: false, until: null },
                        killSwitch: false,
                        lastRunAt: config.lastRunAt?.toISOString() ?? null,
                        nextRecommendedPingAt: null,
                        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
                    },
                });
            }

            const promotion = await promoteStaleSignalQueueItems({ now, limit: DEFAULT_RUN_LIMIT });

            if (promotion.promoted === 0) {
                return NextResponse.json({
                    success: true,
                    data: {
                        status: "skipped",
                        reason: "no_stale_signal_queue_items",
                        promoted: 0,
                        candidateSignals: promotion.candidateSignals,
                        candidateQueueItems: promotion.candidateQueueItems,
                        refreshedItemIds: [],
                        processed: 0,
                        claimed: 0,
                        succeeded: 0,
                        failed: 0,
                        skippedDueToBudget: 0,
                        scmValidatedCount: 0,
                        csfloatCandidateCount: 0,
                        stalePromotionCount: 0,
                        stalePromotedItemIds: [],
                        lanes: EMPTY_LANES,
                        remainingDue: 0,
                        oldestDueAgeMinutes: null,
                        circuitBreaker: { active: false, until: null },
                        killSwitch: false,
                        lastRunAt: config.lastRunAt?.toISOString() ?? null,
                        nextRecommendedPingAt: null,
                        scmBudget: buildScmBudgetSummary(config.requestBudget, now),
                    },
                });
            }

            const result = await runIntelligenceQueue({
                perRunCap: promotion.promoted,
                budgetMs: DEFAULT_BUDGET_MS,
                minRemainingMsToStartJob: MIN_REMAINING_MS_TO_START_JOB,
                itemIds: promotion.itemIds,
            });
            const refreshedConfig = await prisma.intelligenceConfig.findUnique({
                where: { id: "default" },
                select: {
                    circuitBreakerUntil: true,
                    lastRunAt: true,
                    requestBudget: true,
                },
            });
            const remainingDue = (result.summary?.pending ?? 0) + (result.summary?.backoff ?? 0);
            const circuitBreakerUntil = refreshedConfig?.circuitBreakerUntil ?? null;

            return NextResponse.json({
                success: true,
                data: {
                    status: result.status,
                    reason: result.reason,
                    promoted: promotion.promoted,
                    candidateSignals: promotion.candidateSignals,
                    candidateQueueItems: promotion.candidateQueueItems,
                    refreshedItemIds: promotion.itemIds,
                    processed: result.processed,
                    claimed: result.claimed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                    skippedDueToBudget: result.skippedDueToBudget,
                    scmValidatedCount: result.scmValidatedCount,
                    csfloatCandidateCount: result.csfloatCandidateCount,
                    stalePromotionCount: result.stalePromotionCount,
                    stalePromotedItemIds: result.stalePromotedItemIds,
                    lanes: result.lanes,
                    timeBudgetExceeded: result.timeBudgetExceeded,
                    budgetMs: result.budgetMs,
                    elapsedMs: result.elapsedMs,
                    remainingMs: result.remainingMs,
                    requestedLimit: result.requestedLimit,
                    effectiveLimit: result.effectiveLimit,
                    remainingDue,
                    oldestDueAgeMinutes: oldestDueAgeMinutes(result.summary),
                    circuitBreaker: {
                        active: result.circuitBreakerOpened || (circuitBreakerUntil !== null && circuitBreakerUntil.getTime() > now.getTime()),
                        until: circuitBreakerUntil?.toISOString() ?? null,
                    },
                    killSwitch: false,
                    lastRunAt: refreshedConfig?.lastRunAt?.toISOString() ?? now.toISOString(),
                    nextRecommendedPingAt: nextRecommendedPingAt(result.summary, now),
                    scmBudget: refreshedConfig?.requestBudget !== undefined
                        ? buildScmBudgetSummary(refreshedConfig.requestBudget, now)
                        : result.scmBudget ?? buildScmBudgetSummary(config.requestBudget, now),
                },
            });
        } finally {
            refreshInFlight = false;
        }
    } catch (error) {
        refreshInFlight = false;
        console.error("[IntelligenceRoute /refresh]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Intelligence refresh failed" },
            { status: 500 }
        );
    }
}
