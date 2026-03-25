/**
 * POST /api/portfolio/prices — Refresh price snapshots for portfolio items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";

export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        const inventoryItems = await prisma.inventoryItem.findMany({
            where: {
                userId,
                soldAt: null,
            },
            include: {
                item: { select: { id: true, marketHashName: true } },
            },
        });

        const itemIdByHash = new Map<string, string>();
        for (const inv of inventoryItems) {
            itemIdByHash.set(inv.item.marketHashName, inv.item.id);
        }

        const fallbackParam = request.nextUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: undefined,
            allowSteamLimit: true,
            allowFallback,
            ...(allowFallback ? { overrideSource: "steam" } : {}),
        });

        return NextResponse.json({
            success: true,
            data: {
                pricedCount: pricingResult.pricedCount,
                priceSource: pricingResult.provider,
                priceCoverage: {
                    total: pricingResult.totalRequested,
                    priced: pricingResult.pricedCount,
                    candidates: pricingResult.totalCandidates,
                },
                priceSkippedRecent: pricingResult.skippedRecent,
                priceLimitedTo: pricingResult.limitedTo ?? null,
                fallbackAvailable: pricingResult.fallbackAvailable,
                failureReason: pricingResult.failureReason ?? null,
                attemptedProvider: pricingResult.attemptedProvider,
            },
        });
    } catch (error) {
        console.error("[API /portfolio/prices POST]", error);
        return NextResponse.json(
            { success: false, error: "Failed to refresh portfolio prices" },
            { status: 500 }
        );
    }
}
