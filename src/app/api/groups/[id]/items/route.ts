/**
 * POST /api/groups/[id]/items — Assign items to a group
 * DELETE /api/groups/[id]/items — Remove items from a group
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

const ItemIdsSchema = z.object({
    itemIds: z.array(z.string().min(1)).min(1),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;
        const body = await request.json();
        const { itemIds } = ItemIdsSchema.parse(body);

        const group = await prisma.watchlistGroup.findUnique({ where: { id } });
        if (!group) {
            return NextResponse.json(
                { success: false, error: "Group not found" },
                { status: 404 }
            );
        }

        const watchedItems = await prisma.item.findMany({
            where: { id: { in: itemIds }, isActive: true, isWatched: true },
            select: { id: true },
        });
        const watchedItemIds = watchedItems.map((item) => item.id);

        if (watchedItemIds.length === 0) {
            return NextResponse.json(
                { success: false, error: "No selected items are in the watchlist" },
                { status: 400 }
            );
        }

        const existing = await prisma.itemGroup.findMany({
            where: { groupId: id, itemId: { in: watchedItemIds } },
            select: { itemId: true },
        });
        const existingSet = new Set(existing.map((e) => e.itemId));
        const newItemIds = watchedItemIds.filter((itemId) => !existingSet.has(itemId));

        let added = 0;
        if (newItemIds.length > 0) {
            const result = await prisma.itemGroup.createMany({
                data: newItemIds.map((itemId) => ({
                    itemId,
                    groupId: id,
                })),
            });
            added = result.count;
        }

        return NextResponse.json(
            { success: true, data: { added } },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid item data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /groups/[id]/items POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;
        const body = await request.json();
        const { itemIds } = ItemIdsSchema.parse(body);

        const group = await prisma.watchlistGroup.findUnique({ where: { id } });
        if (!group) {
            return NextResponse.json(
                { success: false, error: "Group not found" },
                { status: 404 }
            );
        }

        const result = await prisma.itemGroup.deleteMany({
            where: {
                groupId: id,
                itemId: { in: itemIds },
            },
        });

        return NextResponse.json({
            success: true,
            data: { removed: result.count },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid item data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /groups/[id]/items DELETE]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
