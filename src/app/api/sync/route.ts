/**
 * POST /api/sync — Trigger a manual price sync
 * GET /api/sync — Get recent sync logs, or trigger price sync via Vercel Cron
 *
 * Market cap calculation is handled independently by /api/market/market-cap-sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { initializeMarketProviders } from "@/lib/market/init";
import { runSync, getRecentSyncLogs, getLatestPriceUpdate } from "@/lib/market/sync";
import { prisma } from "@/lib/db";
import type { MarketSource } from "@/types";

function getRequestSearchParams(request: NextRequest): URLSearchParams {
    if ("nextUrl" in request && request.nextUrl) {
        return request.nextUrl.searchParams;
    }

    return new URL(request.url).searchParams;
}

async function runPriceSync(overrideSource?: MarketSource) {
    await initializeMarketProviders();
    return runSync(overrideSource);
}

const SOLD_ITEM_RETENTION_DAYS = 60;

async function cleanupOldSoldItems() {
    const cutoff = new Date(Date.now() - SOLD_ITEM_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.inventoryItem.deleteMany({
        where: {
            soldAt: { not: null, lt: cutoff },
        },
    });
    if (result.count > 0) {
        console.log(`[Sync Cleanup] Deleted ${result.count} sold items older than ${SOLD_ITEM_RETENTION_DAYS} days`);
    }
    return result.count;
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await requireAuth();
        if (authResult.error) return authResult.error;

        const fallbackParam = getRequestSearchParams(request).get("fallback");
        const overrideSource = fallbackParam === "steam" ? "steam" as const : undefined;

        const syncResult = await runPriceSync(overrideSource);

        return NextResponse.json(
            {
                success: syncResult.status !== "failed",
                data: { sync: syncResult },
            },
            { status: syncResult.status === "failed" ? 500 : 200 }
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

        // Reject explicitly when an auth header is present but doesn't match
        if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { success: false, error: "Unauthorized — invalid CRON_SECRET" },
                { status: 401 }
            );
        }

        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
            const [syncResult, cleanedCount] = await Promise.all([
                runPriceSync(),
                cleanupOldSoldItems(),
            ]);

            return NextResponse.json(
                {
                    success: syncResult.status !== "failed",
                    data: { sync: syncResult, soldItemsCleaned: cleanedCount },
                },
                { status: syncResult.status === "failed" ? 500 : 200 }
            );
        }

        // Normal GET — return sync logs
        const logs = await getRecentSyncLogs(20);
        const lastPriceUpdate = await getLatestPriceUpdate();

        return NextResponse.json({
            success: true,
            data: { logs, lastPriceUpdate },
        }, {
            headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
        });
    } catch (error) {
        console.error("[API /sync GET]", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sync logs" },
            { status: 500 }
        );
    }
}
