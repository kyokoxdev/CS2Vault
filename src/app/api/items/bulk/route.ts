/**
 * POST /api/items/bulk — Bulk actions on items (unwatch, rewatch)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

const MAX_BULK_ITEMS = 100;

const BulkActionSchema = z.object({
    action: z.enum(["unwatch", "rewatch"]),
    itemIds: z
        .array(z.string())
        .min(1, "At least one item ID is required")
        .max(MAX_BULK_ITEMS, `Maximum ${MAX_BULK_ITEMS} items per request`),
});

export async function POST(request: NextRequest) {
    const { session: _s, error: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const body = await request.json();
        const { action, itemIds } = BulkActionSchema.parse(body);

        let result: { count: number };

        switch (action) {
            case "unwatch":
                result = await prisma.item.updateMany({
                    where: { id: { in: itemIds } },
                    data: { isWatched: false },
                });
                break;

            case "rewatch":
                result = await prisma.item.updateMany({
                    where: { id: { in: itemIds } },
                    data: { isWatched: true },
                });
                break;
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
