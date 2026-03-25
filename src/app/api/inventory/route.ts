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
 */
export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const steamId = session.user.steamId;

        // Ensure user exists
        let user = await prisma.user.findUnique({ where: { steamId } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    steamId,
                    displayName: session.user.name,
                },
            });
        }

        // Fetch inventory from Steam
        const inventoryItems = await fetchSteamInventory(steamId);

        let synced = 0;
        let skipped = 0;
        const itemIdByHash = new Map<string, string>();

        for (const invItem of inventoryItems) {
            const normalizedType = invItem.category === "weapon"
                ? normalizeItemType(invItem.itemType) ?? undefined
                : undefined;
            // Upsert the linked Item (market item)
            const item = await prisma.item.upsert({
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

            // Upsert InventoryItem (by assetId)
            try {
                await prisma.inventoryItem.upsert({
                    where: { assetId: invItem.assetId },
                    create: {
                        userId: user.id,
                        itemId: item.id,
                        assetId: invItem.assetId,
                    },
                    update: {
                        itemId: item.id, // Update in case item was recreated
                    },
                });
                synced++;
            } catch {
                skipped++;
            }
        }

        // Fetch latest prices for synced inventory items (no watchlist dependency)
        const fallbackParam = request.nextUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: 0,
            allowFallback,
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
                skipped,
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
