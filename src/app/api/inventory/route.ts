/**
 * GET /api/inventory — List user's inventory items
 * POST /api/inventory — Sync inventory from Steam
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { fetchSteamInventory } from "@/lib/inventory/steam-inventory";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";
import { normalizeItemType } from "@/lib/market/rarity";

/**
 * GET — List inventory items with current prices.
 */
export async function GET(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        const filter = request.nextUrl.searchParams.get("filter"); // "all" | "tradable" | "sold"

        const whereClause: Record<string, unknown> = { userId };
        if (filter === "tradable") whereClause.soldAt = null;
        if (filter === "sold") whereClause.soldAt = { not: null };

        const inventoryItems = await prisma.inventoryItem.findMany({
            where: whereClause,
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
            orderBy: { acquiredAt: "desc" },
        });

        // Get latest prices for all linked items
        const itemIds = [...new Set(inventoryItems.map((i) => i.itemId))];
        const latestPrices = await prisma.priceSnapshot.findMany({
            where: { itemId: { in: itemIds } },
            orderBy: { timestamp: "desc" },
            distinct: ["itemId"],
        });
        const priceMap = new Map(latestPrices.map((p) => [p.itemId, p.price]));

        const enriched = inventoryItems.map((inv) => ({
            ...inv,
            currentPrice: priceMap.get(inv.itemId) ?? null,
            pnl: inv.acquiredPrice && priceMap.has(inv.itemId)
                ? (priceMap.get(inv.itemId)! - inv.acquiredPrice)
                : null,
            pnlPercent: inv.acquiredPrice && inv.acquiredPrice > 0 && priceMap.has(inv.itemId)
                ? ((priceMap.get(inv.itemId)! - inv.acquiredPrice) / inv.acquiredPrice) * 100
                : null,
        }));

        return NextResponse.json({
            success: true,
            data: { items: enriched, count: enriched.length },
        });
    } catch (error) {
        console.error("[API /inventory GET]", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch inventory" },
            { status: 500 }
        );
    }
}

/**
 * POST — Sync inventory from Steam.
 * Fetches inventory, upserts linked Item records, and upserts InventoryItem records.
 * Removes items no longer present in Steam inventory (sold/traded externally).
 */
export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const steamId = session.user.steamId;

        let user = await prisma.user.findUnique({ where: { steamId } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    steamId,
                    displayName: session.user.name,
                },
            });
        }

        const userId = user.id;

        const [inventoryItems, currentDbItems] = await Promise.all([
            fetchSteamInventory(steamId),
            prisma.inventoryItem.findMany({
                where: { userId, soldAt: null },
                select: { id: true, assetId: true },
            }),
        ]);

        const steamAssetIds = new Set(inventoryItems.map((i) => i.assetId));
        const dbAssetIds = new Set(currentDbItems.map((i) => i.assetId));

        const staleIds = currentDbItems
            .filter((i) => !steamAssetIds.has(i.assetId))
            .map((i) => i.id);

        let synced = 0;
        let added = 0;
        const itemIdByHash = new Map<string, string>();

        if (staleIds.length > 0) {
            await prisma.inventoryItem.deleteMany({
                where: { id: { in: staleIds } },
            });
        }

        const BATCH_SIZE = 50;
        for (let i = 0; i < inventoryItems.length; i += BATCH_SIZE) {
            const batch = inventoryItems.slice(i, i + BATCH_SIZE);

            await prisma.$transaction(async (tx) => {
                for (const invItem of batch) {
                    const normalizedType = invItem.category === "weapon"
                        ? normalizeItemType(invItem.itemType) ?? undefined
                        : undefined;

                    const item = await tx.item.upsert({
                        where: { marketHashName: invItem.marketHashName },
                        create: {
                            marketHashName: invItem.marketHashName,
                            name: invItem.name,
                            weapon: invItem.weapon,
                            skin: invItem.skin,
                            category: invItem.category,
                            type: normalizedType,
                            rarity: invItem.rarity ?? undefined,
                            exterior: invItem.exterior,
                            imageUrl: invItem.imageUrl,
                            isWatched: false,
                            isActive: true,
                        },
                        update: {
                            imageUrl: invItem.imageUrl,
                            category: invItem.category,
                            type: normalizedType,
                            rarity: invItem.rarity ?? undefined,
                            exterior: invItem.exterior ?? undefined,
                            weapon: invItem.weapon ?? undefined,
                            skin: invItem.skin ?? undefined,
                        },
                    });

                    itemIdByHash.set(invItem.marketHashName, item.id);

                    try {
                        await tx.inventoryItem.upsert({
                            where: { assetId: invItem.assetId },
                            create: {
                                userId,
                                itemId: item.id,
                                assetId: invItem.assetId,
                            },
                            update: {
                                itemId: item.id,
                            },
                        });

                        if (!dbAssetIds.has(invItem.assetId)) added++;
                        synced++;
                    } catch {
                        // Skip items that fail (e.g. constraint violations)
                    }
                }
            });
        }

        const fallbackParam = request.nextUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: 0,
            allowFallback,
            skipCandleAggregation: true,
            ...(allowFallback ? { overrideSource: "steam" } : {}),
        });

        const limitLabel = pricingResult.limitedTo ? ` (limited to ${pricingResult.limitedTo})` : "";
        console.log(
            `[Inventory Sync] Priced ${pricingResult.pricedCount}/${pricingResult.totalRequested} items using ${pricingResult.provider}${limitLabel}`
        );

        return NextResponse.json({
            success: true,
            data: {
                totalFetched: inventoryItems.length,
                synced,
                added,
                removed: staleIds.length,
                pricedCount: pricingResult.pricedCount,
                priceSource: pricingResult.provider,
                fallbackAvailable: pricingResult.fallbackAvailable,
                failureReason: pricingResult.failureReason ?? null,
                attemptedProvider: pricingResult.attemptedProvider,
                priceCoverage: {
                    total: pricingResult.totalRequested,
                    priced: pricingResult.pricedCount,
                    candidates: pricingResult.totalCandidates,
                },
                priceSkippedRecent: pricingResult.skippedRecent,
                priceLimitedTo: pricingResult.limitedTo ?? null,
                steamId,
            },
        });
    } catch (error) {
        console.error("[API /inventory POST]", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Inventory sync failed" },
            { status: 500 }
        );
    }
}
