/**
 * PATCH /api/inventory/[id] — Update cost basis (acquiredPrice, soldPrice, soldAt)
 * DELETE /api/inventory/[id] — Remove an inventory item
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

const UpdateSchema = z.object({
    acquiredPrice: z.number().min(0).optional(),
    soldPrice: z.number().min(0).optional(),
    soldAt: z.string().datetime().optional().nullable(),
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
        const data = UpdateSchema.parse(body);

        const existing = await prisma.inventoryItem.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Inventory item not found" },
                { status: 404 }
            );
        }

        const updated = await prisma.inventoryItem.update({
            where: { id },
            data: {
                acquiredPrice: data.acquiredPrice ?? existing.acquiredPrice,
                soldPrice: data.soldPrice ?? existing.soldPrice,
                soldAt: data.soldAt !== undefined
                    ? (data.soldAt ? new Date(data.soldAt) : null)
                    : existing.soldAt,
            },
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /inventory/[id] PATCH]", error);
        return NextResponse.json(
            { success: false, error: "Failed to update" },
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

        const existing = await prisma.inventoryItem.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json(
                { success: false, error: "Inventory item not found" },
                { status: 404 }
            );
        }

        await prisma.inventoryItem.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[API /inventory/[id] DELETE]", error);
        return NextResponse.json(
            { success: false, error: "Failed to delete" },
            { status: 500 }
        );
    }
}
