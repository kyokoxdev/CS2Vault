/**
 * POST /api/sync — Trigger a manual market data sync
 * GET /api/sync — Get recent sync logs
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

export async function GET() {
    try {
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
