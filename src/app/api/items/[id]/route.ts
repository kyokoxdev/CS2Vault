/**
 * GET /api/items/[id] — Fetch a single item
 * PATCH /api/items/[id] — Update an item (toggle watchlist, edit fields)
 * DELETE /api/items/[id] — Soft-delete an item (mark inactive)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeRarity, normalizeItemType } from "@/lib/market/rarity";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

function mapGroups(groups: Array<{ group: { id: string; name: string; color: string | null } }>) {
    return groups.map(({ group }) => ({
        id: group.id,
        name: group.name,
        color: group.color,
    }));
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: {
                groups: {
                    include: {
                        group: true,
                    },
                },
            },
        });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }
        return NextResponse.json({
            success: true,
            data: {
                ...item,
                type: item.category === "weapon" ? normalizeItemType(item.type) : null,
                rarity: normalizeRarity(item.rarity),
                groups: mapGroups(item.groups),
            },
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
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session: _s, error: authError } = await requireAuth();
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

        const updated = await prisma.item.update({
            where: { id },
            data,
        });

        return NextResponse.json({ success: true, data: updated });
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
        const { session: _s, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await params;

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }

        // Soft delete — mark as inactive
        await prisma.item.update({
            where: { id },
            data: { isActive: false, isWatched: false },
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
