/**
 * GET /api/groups — List all watchlist groups with item counts
 * POST /api/groups — Create a new watchlist group
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CreateGroupSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().max(50).optional(),
});

export async function GET() {
    try {
        const groups = await prisma.watchlistGroup.findMany({
            orderBy: { sortOrder: "asc" },
            include: {
                _count: { select: { items: true } },
            },
        });

        return NextResponse.json({
            success: true,
            data: { groups, total: groups.length },
        });
    } catch (error) {
        console.error("[API /groups GET]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const data = CreateGroupSchema.parse(body);

        const existing = await prisma.watchlistGroup.findFirst({
            where: { name: data.name },
        });

        if (existing) {
            return NextResponse.json(
                { success: false, error: "A group with this name already exists" },
                { status: 409 }
            );
        }

        const maxSort = await prisma.watchlistGroup.aggregate({
            _max: { sortOrder: true },
        });
        const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

        const group = await prisma.watchlistGroup.create({
            data: {
                name: data.name,
                color: data.color,
                sortOrder: nextSortOrder,
            },
        });

        return NextResponse.json(
            { success: true, data: group },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid group data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /groups POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
