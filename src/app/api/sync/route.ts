/**
 * POST /api/sync — Trigger a manual market data sync
 * GET /api/sync — Get recent sync logs, or trigger sync via Vercel Cron
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerManualSync } from "@/lib/market/scheduler";
import { requireAuth } from "@/lib/auth/guard";
import { calculateAndStoreMarketCap, shouldRecalculate } from "@/lib/market/market-cap";
import { getRecentSyncLogs } from "@/lib/market/sync";

export async function POST(request: NextRequest) {
    const { session: _s, error: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const fallbackParam = request.nextUrl.searchParams.get("fallback");
        const overrideSource = fallbackParam === "steam" ? "steam" as const : undefined;

        const result = await triggerManualSync(overrideSource);

        return NextResponse.json({
            success: true,
            data: result,
        });
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
            const syncResult = await triggerManualSync();

            const needsRecalculation = await shouldRecalculate();
            let marketCapResult: {
                attempted: boolean;
                status: "ok" | "error" | "skipped";
                message?: string;
            } = {
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

            const hasFailure = syncResult.status === "failed" || marketCapResult.status === "error";

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
