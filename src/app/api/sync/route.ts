/**
 * POST /api/sync — Trigger a manual market data sync
 * GET /api/sync — Get recent sync logs, or trigger sync via Vercel Cron
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerManualSync } from "@/lib/market/scheduler";
import { requireAuth } from "@/lib/auth/guard";
import { calculateAndStoreMarketCap, shouldRecalculate } from "@/lib/market/market-cap";
import { getRecentSyncLogs } from "@/lib/market/sync";

interface MarketCapRefreshResult {
    attempted: boolean;
    status: "ok" | "error" | "skipped";
    message?: string;
}

function getRequestSearchParams(request: NextRequest): URLSearchParams {
    if ("nextUrl" in request && request.nextUrl) {
        return request.nextUrl.searchParams;
    }

    return new URL(request.url).searchParams;
}

async function runSyncWithMarketCapRefresh(overrideSource?: "steam") {
    const syncResult = await triggerManualSync(overrideSource);
    const needsRecalculation = await shouldRecalculate();

    let marketCapResult: MarketCapRefreshResult = {
        attempted: false,
        status: "skipped",
        message: "Recent market cap snapshot exists",
    };

    if (needsRecalculation) {
        const recalculation = await calculateAndStoreMarketCap();
        marketCapResult = {
            attempted: true,
            status: recalculation.status === "error" ? "error" : "ok",
            message: recalculation.message,
        };
    }

    return {
        syncResult,
        marketCapResult,
        hasFailure: syncResult.status === "failed" || marketCapResult.status === "error",
    };
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuth();
        if (authResult.error) return authResult.error;

        const fallbackParam = getRequestSearchParams(request).get("fallback");
        const overrideSource = fallbackParam === "steam" ? "steam" as const : undefined;

        const { syncResult, marketCapResult, hasFailure } = await runSyncWithMarketCapRefresh(overrideSource);

        return NextResponse.json(
            {
                success: !hasFailure,
                data: {
                    sync: syncResult,
                    marketCap: marketCapResult,
                },
            },
            { status: hasFailure ? 500 : 200 }
        );
    } catch (error) {
        console.error("[API /sync POST]", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Sync failed",
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
            const { syncResult, marketCapResult, hasFailure } = await runSyncWithMarketCapRefresh();

            return NextResponse.json(
                {
                    success: !hasFailure,
                    data: {
                        sync: syncResult,
                        marketCap: marketCapResult,
                    },
                },
                { status: hasFailure ? 500 : 200 }
            );
        }

        // Normal GET — return sync logs
        const logs = await getRecentSyncLogs(20);

        return NextResponse.json({
            success: true,
            data: { logs },
        });
    } catch (error) {
        console.error("[API /sync GET]", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sync logs" },
            { status: 500 }
        );
    }
}
