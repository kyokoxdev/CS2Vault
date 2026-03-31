/**
 * GET /api/groups/[id] — Fetch a single group with its items
 * PATCH /api/groups/[id] — Update group name, color, or sortOrder
 * DELETE /api/groups/[id] — Delete group and cascade remove ItemGroup records
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const UpdateGroupSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().max(50).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const group = await prisma.watchlistGroup.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        item: true,
                    },
                },
            },
        });

        if (!group) {
            return NextResponse.json(
                { success: false, error: "Group not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: group });
    } catch (error) {
        console.error("[API /groups/[id] GET]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data = UpdateGroupSchema.parse(body);

        const group = await prisma.watchlistGroup.findUnique({ where: { id } });
        if (!group) {
            return NextResponse.json(
                { success: false, error: "Group not found" },
                { status: 404 }
            );
        }

        if (data.name && data.name !== group.name) {
            const duplicate = await prisma.watchlistGroup.findFirst({
                where: { name: data.name, id: { not: id } },
            });
            if (duplicate) {
                return NextResponse.json(
                    { success: false, error: "A group with this name already exists" },
                    { status: 409 }
                );
            }
        }

        const updated = await prisma.watchlistGroup.update({
            where: { id },
            data,
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid group data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /groups/[id] PATCH]", error);
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
        const { id } = await params;

        const group = await prisma.watchlistGroup.findUnique({ where: { id } });
        if (!group) {
            return NextResponse.json(
                { success: false, error: "Group not found" },
                { status: 404 }
            );
        }

        await prisma.watchlistGroup.delete({ where: { id } });

        return NextResponse.json({ success: true, data: { deleted: true } });
    } catch (error) {
        console.error("[API /groups/[id] DELETE]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
