/**
 * GET /api/portfolio — Aggregated portfolio summary with P&L metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { normalizeRarity, detectWearQuality, normalizeItemType } from "@/lib/market/rarity";

const FILTER_OPTIONS = new Set(["all", "priced", "unpriced"]);

export async function GET(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const params = request.nextUrl.searchParams;
        const category = params.get("category") ?? undefined;
        const rarity = params.get("rarity") ?? undefined;
        const search = params.get("search") ?? undefined;
        const price = params.get("price") ?? undefined;
        const userId = session.user.id;

        // Fetch inventory (unsold items only)
        const inventoryItems = await prisma.inventoryItem.findMany({
            where: {
                userId,
                soldAt: null,
            },
            include: {
                item: {
                    select: {
                        id: true,
                        name: true,
                        marketHashName: true,
                        category: true,
                        type: true,
                        rarity: true,
                        exterior: true,
                        imageUrl: true,
                    },
                },
            },
        });

        if (inventoryItems.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    totalCurrentValue: 0,
                    totalAcquiredValue: 0,
                    unrealizedPnL: 0,
                    unrealizedPnLPercent: 0,
                    itemCount: 0,
                    filteredCount: 0,
                    items: [],
                    filteredTotals: {
                        totalCurrentValue: 0,
                        totalAcquiredValue: 0,
                        unrealizedPnL: 0,
                        unrealizedPnLPercent: 0,
                    },
                    filterOptions: {
                        categories: [],
                        rarities: [],
                    },
                },
            });
        }

        // Get latest prices
        const itemIds = [...new Set(inventoryItems.map((i) => i.itemId))];
        const latestPrices = await prisma.priceSnapshot.findMany({
            where: { itemId: { in: itemIds } },
            orderBy: { timestamp: "desc" },
            distinct: ["itemId"],
        });
        const priceMap = new Map(latestPrices.map((p) => [p.itemId, p.price]));

        let totalCurrentValue = 0;
        let totalAcquiredValue = 0;

        const items = inventoryItems.map((inv) => {
            const currentPrice = priceMap.get(inv.itemId) ?? null;
            const acquiredPrice = inv.acquiredPrice ?? 0;
            const hasPrice = currentPrice !== null && currentPrice > 0;
            const pnl = acquiredPrice > 0 && hasPrice ? currentPrice - acquiredPrice : 0;
            const pnlPercent = acquiredPrice > 0 && hasPrice ? (pnl / acquiredPrice) * 100 : 0;

            if (hasPrice && currentPrice !== null) {
                totalCurrentValue += currentPrice;
            }
            if (inv.acquiredPrice) {
                totalAcquiredValue += inv.acquiredPrice;
            }

            return {
                id: inv.id,
                assetId: inv.assetId,
                name: inv.item.name,
                marketHashName: inv.item.marketHashName,
                category: inv.item.category,
                type: inv.item.category === "weapon"
                    ? normalizeItemType(inv.item.type)
                    : null,
                rarity: normalizeRarity(inv.item.rarity),
                exterior: inv.item.exterior,
                wearQuality: inv.item.category === "weapon"
                    ? detectWearQuality(inv.item.exterior)
                    : null,
                imageUrl: inv.item.imageUrl,
                currentPrice,
                acquiredPrice: inv.acquiredPrice,
                pnl: acquiredPrice > 0 && hasPrice ? pnl : null,
                pnlPercent: acquiredPrice > 0 && hasPrice ? pnlPercent : null,
                floatValue: inv.floatValue,
                acquiredAt: inv.acquiredAt,
            };
        });

        const normalizedSearch = search?.trim().toLowerCase();
        const filtered = items.filter((item) => {
            if (category && item.category !== category) return false;
            if (rarity && item.rarity !== rarity) return false;
            if (normalizedSearch) {
                const haystack = `${item.name} ${item.marketHashName}`.toLowerCase();
                if (!haystack.includes(normalizedSearch)) return false;
            }
            const isPriced = item.currentPrice !== null && item.currentPrice > 0;
            if (price) {
                if (!FILTER_OPTIONS.has(price)) return true;
                if (price === "priced" && !isPriced) return false;
                if (price === "unpriced" && isPriced) return false;
            }
            return true;
        });

        let filteredCurrentValue = 0;
        let filteredAcquiredValue = 0;

        for (const item of filtered) {
            if (item.currentPrice !== null && item.currentPrice > 0) {
                filteredCurrentValue += item.currentPrice;
            }
            if (item.acquiredPrice) {
                filteredAcquiredValue += item.acquiredPrice;
            }
        }

        const filteredUnrealizedPnL = filteredAcquiredValue > 0
            ? filteredCurrentValue - filteredAcquiredValue
            : 0;
        const filteredUnrealizedPnLPercent = filteredAcquiredValue > 0
            ? (filteredUnrealizedPnL / filteredAcquiredValue) * 100
            : 0;

        const availableCategories = [...new Set(items.map((item) => item.category))].sort();
        const availableRarities = [...new Set(
            items
                .map((item) => normalizeRarity(item.rarity))
                .filter((rarity): rarity is string => Boolean(rarity))
        )].sort();

        const unrealizedPnL = totalAcquiredValue > 0
            ? totalCurrentValue - totalAcquiredValue
            : 0;
        const unrealizedPnLPercent = totalAcquiredValue > 0
            ? (unrealizedPnL / totalAcquiredValue) * 100
            : 0;

        return NextResponse.json({
            success: true,
            data: {
                totalCurrentValue,
                totalAcquiredValue,
                unrealizedPnL,
                unrealizedPnLPercent,
                itemCount: items.length,
                filteredCount: filtered.length,
                items: filtered,
                filteredTotals: {
                    totalCurrentValue: filteredCurrentValue,
                    totalAcquiredValue: filteredAcquiredValue,
                    unrealizedPnL: filteredUnrealizedPnL,
                    unrealizedPnLPercent: filteredUnrealizedPnLPercent,
                },
                filter: {
                    category: category ?? null,
                    rarity: rarity ?? null,
                    search: search ?? null,
                    price: price ?? null,
                },
                filterOptions: {
                    categories: availableCategories,
                    rarities: availableRarities,
                },
            },
        });
    } catch (error) {
        console.error("[API /portfolio GET]", error);
        return NextResponse.json(
            { success: false, error: "Failed to compute portfolio" },
            { status: 500 }
        );
    }
}
