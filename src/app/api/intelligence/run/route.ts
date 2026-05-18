import { NextRequest, NextResponse } from "next/server";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";
import { prisma } from "@/lib/db";

function isCronAuthorized(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;

    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) return true;

    const cronHeader = request.headers.get("x-cron-secret");
    if (cronHeader === cronSecret) return true;

    return false;
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

        const result = await runIntelligenceQueue();
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
                processed: result.processed,
                skippedDueToBudget: result.skippedDueToBudget,
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
