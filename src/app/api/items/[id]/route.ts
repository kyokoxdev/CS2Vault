/**
 * GET /api/items/[id] — Fetch a single item
 * PATCH /api/items/[id] — Update an item (toggle watchlist, edit fields)
 * DELETE /api/items/[id] — Remove an item from the global watchlist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeRarity, normalizeItemType } from "@/lib/market/rarity";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { mapWatchlistGroups, restoreGlobalItemGroups } from "@/lib/watchlist/global-watchlist";

interface ItemWithGroups {
    category: string;
    type: string | null;
    rarity: string | null;
    notes: string | null;
    isWatched: boolean;
    groups: Parameters<typeof mapWatchlistGroups>[0];
}

const itemInclude = {
    groups: {
        include: { group: true },
    },
};

function formatItemResponse<T extends ItemWithGroups>(item: T) {
    return {
        ...item,
        type: item.category === "weapon" ? normalizeItemType(item.type) : null,
        rarity: normalizeRarity(item.rarity),
        notes: item.notes,
        isWatched: item.isWatched,
        groups: mapWatchlistGroups(item.groups),
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: itemInclude,
        });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }
        return NextResponse.json({
            success: true,
            data: formatItemResponse(item),
        });
    } catch (error) {
        console.error("[API /items/[id] GET]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

const UpdateItemSchema = z.object({
    isWatched: z.boolean().optional(),
    name: z.string().optional(),
    category: z.string().optional(),
    imageUrl: z.string().url().optional(),
    notes: z.string().nullable().optional(),
    restoreGroupIds: z.array(z.string()).max(100).optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;
        const body = await request.json();
        const data = UpdateItemSchema.parse(body);

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }

        const { isWatched, notes, restoreGroupIds, ...itemUpdates } = data;
        const updateData: typeof itemUpdates & { isWatched?: boolean; notes?: string | null } = { ...itemUpdates };

        if (isWatched !== undefined) {
            updateData.isWatched = isWatched;
            updateData.notes = isWatched ? notes ?? item.notes : null;
        } else if (notes !== undefined) {
            updateData.notes = notes;
        }

        if (isWatched === false) {
            await prisma.itemGroup.deleteMany({ where: { itemId: id } });
        }

        let updated = Object.keys(updateData).length > 0
            ? await prisma.item.update({
                where: { id },
                data: updateData,
                include: itemInclude,
            })
            : await prisma.item.findUnique({
                where: { id },
                include: itemInclude,
            });

        if (isWatched === true && restoreGroupIds && restoreGroupIds.length > 0) {
            await restoreGlobalItemGroups(id, restoreGroupIds);
            updated = await prisma.item.findUnique({
                where: { id },
                include: itemInclude,
            });
        }

        if (!updated) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: formatItemResponse(updated),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /items/[id] PATCH]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }

        await prisma.itemGroup.deleteMany({ where: { itemId: id } });
        await prisma.item.update({
            where: { id },
            data: { isWatched: false, notes: null },
        });

        return NextResponse.json({ success: true, data: { deleted: true } });
    } catch (error) {
        console.error("[API /items/[id] DELETE]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
