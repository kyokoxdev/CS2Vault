/**
 * POST /api/watchlist/prices — Refresh price snapshots for watched items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";

export async function POST(request: NextRequest) {
    try {
        const { session: _s, error: authError } = await requireAuth();
        if (authError) return authError;

        const watchedItems = await prisma.item.findMany({
            where: {
                isWatched: true,
                isActive: true,
            },
            select: { id: true, marketHashName: true },
        });

        const itemIdByHash = new Map<string, string>();
        for (const item of watchedItems) {
            itemIdByHash.set(item.marketHashName, item.id);
        }

        const fallbackParam = request.nextUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: undefined,
            allowSteamLimit: true,
            allowFallback,
            ...(allowFallback ? { overrideSource: "steam" as const } : {}),
        });

        return NextResponse.json({
            success: true,
            data: {
                itemCount: pricingResult.pricedCount,
                priceSource: pricingResult.provider,
                priceCoverage: {
                    total: pricingResult.totalRequested,
                    priced: pricingResult.pricedCount,
                    candidates: pricingResult.totalCandidates,
                },
                skippedRecent: pricingResult.skippedRecent,
                limitedTo: pricingResult.limitedTo ?? null,
                fallbackAvailable: pricingResult.fallbackAvailable,
                failureReason: pricingResult.failureReason ?? null,
                attemptedProvider: pricingResult.attemptedProvider,
            },
        });
    } catch (error) {
        console.error("[API /watchlist/prices POST]", error);
        return NextResponse.json(
            { success: false, error: "Failed to refresh watchlist prices" },
            { status: 500 }
        );
    }
}
