/**
 * POST /api/items/bulk — Bulk actions on items (unwatch, rewatch, clearAll)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { restoreGlobalItemGroups } from "@/lib/watchlist/global-watchlist";

const MAX_BULK_ITEMS = 100;

const RestoreStateSchema = z.object({
    itemId: z.string(),
    notes: z.string().nullable().optional(),
    groupIds: z.array(z.string()).max(100).optional(),
});

const BulkActionSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("unwatch"),
        itemIds: z
            .array(z.string())
            .min(1, "At least one item ID is required")
            .max(MAX_BULK_ITEMS, `Maximum ${MAX_BULK_ITEMS} items per request`),
    }),
    z.object({
        action: z.literal("rewatch"),
        itemIds: z
            .array(z.string())
            .min(1, "At least one item ID is required")
            .max(MAX_BULK_ITEMS, `Maximum ${MAX_BULK_ITEMS} items per request`),
        restoreStates: z.array(RestoreStateSchema).max(MAX_BULK_ITEMS).optional(),
    }),
    z.object({
        action: z.literal("clearAll"),
    }),
]);

export async function POST(request: NextRequest) {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const body = BulkActionSchema.parse(await request.json());
        const restoreStateByItemId = new Map(
            (body.action === "rewatch" ? body.restoreStates ?? [] : []).map((state) => [state.itemId, state]),
        );

        let result: { count: number };

        switch (body.action) {
            case "unwatch":
                await prisma.itemGroup.deleteMany({
                    where: {
                        itemId: { in: body.itemIds },
                    },
                });
                result = await prisma.item.updateMany({
                    where: { id: { in: body.itemIds }, isActive: true, isWatched: true },
                    data: { isWatched: false, notes: null },
                });
                break;

            case "rewatch": {
                const activeItems = await prisma.item.findMany({
                    where: { id: { in: body.itemIds }, isActive: true, isWatched: false },
                    select: { id: true },
                });
                const newItemIds = activeItems.map((item) => item.id);

                if (newItemIds.length === 0) {
                    result = { count: 0 };
                    break;
                }

                await Promise.all(newItemIds.map((itemId) => {
                    const restoreState = restoreStateByItemId.get(itemId);
                    return prisma.item.update({
                        where: { id: itemId },
                        data: {
                            isWatched: true,
                            ...(restoreState && "notes" in restoreState ? { notes: restoreState.notes ?? null } : {}),
                        },
                    });
                }));
                await Promise.all(newItemIds.map((itemId) => {
                    const restoreState = restoreStateByItemId.get(itemId);
                    return restoreGlobalItemGroups(itemId, restoreState?.groupIds);
                }));
                result = { count: newItemIds.length };
                break;
            }

            case "clearAll": {
                const watchedItems = await prisma.item.findMany({
                    where: { isActive: true, isWatched: true },
                    select: { id: true },
                });
                const watchedItemIds = watchedItems.map((item) => item.id);

                if (watchedItemIds.length === 0) {
                    result = { count: 0 };
                    break;
                }

                await prisma.itemGroup.deleteMany({
                    where: {
                        itemId: { in: watchedItemIds },
                    },
                });
                result = await prisma.item.updateMany({
                    where: { id: { in: watchedItemIds }, isActive: true, isWatched: true },
                    data: { isWatched: false, notes: null },
                });
                break;
            }
        }

        return NextResponse.json({
            success: true,
            affected: result.count,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /items/bulk POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
