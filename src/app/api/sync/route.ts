/**
 * POST /api/sync — Trigger a manual market data sync
 * GET /api/sync — Get recent sync logs, or trigger sync via Vercel Cron
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerManualSync } from "@/lib/market/scheduler";
import { getRecentSyncLogs } from "@/lib/market/sync";

export async function POST(request: NextRequest) {
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
            // Triggered by Vercel Cron — run sync
            const result = await triggerManualSync();
            return NextResponse.json({ success: true, data: result });
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
