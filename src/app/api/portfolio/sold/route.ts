/**
 * GET /api/portfolio/sold — Sold items with realized P&L metrics
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { normalizeRarity } from "@/lib/market/rarity";

export async function GET() {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        const soldItems = await prisma.inventoryItem.findMany({
            where: { userId, soldAt: { not: null } },
            include: {
                item: {
                    select: {
                        id: true,
                        name: true,
                        marketHashName: true,
                        category: true,
                        rarity: true,
                        exterior: true,
                        imageUrl: true,
                    },
                },
            },
            orderBy: { soldAt: "desc" },
        });

        let totalSoldValue = 0;
        let totalAcquiredValue = 0;
        let totalRealizedPnL = 0;

        const items = soldItems.map((inv) => {
            const soldPrice = inv.soldPrice ?? 0;
            const acquiredPrice = inv.acquiredPrice ?? 0;
            const realizedPnl = (soldPrice > 0 && acquiredPrice > 0)
                ? soldPrice - acquiredPrice
                : 0;
            const pnlPercent = acquiredPrice > 0
                ? (realizedPnl / acquiredPrice) * 100
                : 0;

            totalSoldValue += soldPrice;
            if (acquiredPrice > 0) totalAcquiredValue += acquiredPrice;
            totalRealizedPnL += realizedPnl;

            return {
                id: inv.id,
                itemId: inv.item.id,
                assetId: inv.assetId,
                name: inv.item.name,
                marketHashName: inv.item.marketHashName,
                category: inv.item.category,
                rarity: normalizeRarity(inv.item.rarity),
                exterior: inv.item.exterior,
                imageUrl: inv.item.imageUrl,
                acquiredPrice: inv.acquiredPrice,
                soldPrice: inv.soldPrice,
                realizedPnl,
                pnlPercent,
                acquiredAt: inv.acquiredAt,
                soldAt: inv.soldAt,
            };
        });

        const realizedPnLPercent = totalAcquiredValue > 0
            ? (totalRealizedPnL / totalAcquiredValue) * 100
            : 0;

        return NextResponse.json({
            success: true,
            data: {
                totalSoldValue,
                totalAcquiredValue,
                totalRealizedPnL,
                realizedPnLPercent,
                soldCount: items.length,
                items,
            },
        }, {
            headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
        });
    } catch (error) {
        console.error("[API /portfolio/sold GET]", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sold items" },
            { status: 500 }
        );
    }
}
