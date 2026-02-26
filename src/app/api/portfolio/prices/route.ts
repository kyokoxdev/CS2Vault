/**
 * POST /api/portfolio/prices — Refresh price snapshots for portfolio items
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";

export async function POST() {
    try {
        const session = await auth();
        let userId: string | undefined;

        if (session?.user?.id) {
            userId = session.user.id;
        } else if (process.env.NODE_ENV === "development") {
            const firstUser = await prisma.user.findFirst();
            userId = firstUser?.id;
        }

        const inventoryItems = await prisma.inventoryItem.findMany({
            where: {
                ...(userId ? { userId } : {}),
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

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: undefined,
            allowSteamLimit: true,
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
