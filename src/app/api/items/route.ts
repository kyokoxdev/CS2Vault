/**
 * GET /api/items — List all items (with optional filters)
 * POST /api/items — Add a new item to the watchlist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeItemType, normalizeRarity } from "@/lib/market/rarity";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

const ItemQuerySchema = z.object({
    watched: z.enum(["true", "false", "all"]).optional(),
    category: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().min(1).max(200).optional().default(50),
    offset: z.coerce.number().min(0).optional().default(0),
});

const AddItemSchema = z.object({
    marketHashName: z.string().min(1),
    name: z.string().min(1),
    weapon: z.string().optional(),
    skin: z.string().optional(),
    category: z.string().default("weapon"),
    type: z.string().optional(),
    rarity: z.string().optional(),
    exterior: z.string().optional(),
    imageUrl: z.string().url().optional(),
    isWatched: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
    try {
        const params = Object.fromEntries(request.nextUrl.searchParams);
        const query = ItemQuerySchema.parse(params);

        const where: Record<string, unknown> = { isActive: true };

        const watched = query.watched ?? "true";
        if (watched !== "all") {
            where.isWatched = watched === "true";
        }
        if (query.category) {
            where.category = query.category;
        }
        if (query.search) {
            where.name = { contains: query.search };
        }

        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                include: {
                    priceSnapshots: {
                        orderBy: { timestamp: "desc" },
                        take: 1,
                    },
                },
                orderBy: { name: "asc" },
                take: query.limit,
                skip: query.offset,
            }),
            prisma.item.count({ where }),
        ]);

        // Format response with latest price
        const formatted = items.map((item) => {
            const latestSnapshot = item.priceSnapshots[0];
            return {
                id: item.id,
                marketHashName: item.marketHashName,
                name: item.name,
                weapon: item.weapon,
                skin: item.skin,
                category: item.category,
                type: item.category === "weapon" ? normalizeItemType(item.type ?? null) : null,
                rarity: normalizeRarity(item.rarity),
                exterior: item.exterior,
                imageUrl: item.imageUrl,
                isWatched: item.isWatched,
                currentPrice: latestSnapshot?.price ?? null,
                priceSource: latestSnapshot?.source ?? null,
                lastUpdated: latestSnapshot?.timestamp ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            data: { items: formatted, total, limit: query.limit, offset: query.offset },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid query parameters", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /items GET]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const { session: _s, error: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const body = await request.json();
        const data = AddItemSchema.parse(body);
        const normalizedRarity = normalizeRarity(data.rarity ?? null) ?? undefined;
        const normalizedType = data.category === "weapon"
            ? normalizeItemType(data.type ?? null) ?? undefined
            : undefined;

        // Check if item already exists
        const existing = await prisma.item.findUnique({
            where: { marketHashName: data.marketHashName },
        });

        if (existing) {
            // If it exists but is inactive, reactivate it
            if (!existing.isActive) {
                const updated = await prisma.item.update({
                    where: { id: existing.id },
                    data: {
                        isActive: true,
                        isWatched: data.isWatched,
                        category: data.category,
                        name: data.name,
                        type: normalizedType ?? existing.type,
                        rarity: normalizedRarity ?? existing.rarity,
                        exterior: data.exterior ?? existing.exterior,
                    },
                });
                return NextResponse.json({ success: true, data: updated });
            }
            // Item exists and is active — update category/name and ensure it's watched
            const updated = await prisma.item.update({
                where: { id: existing.id },
                data: {
                    isWatched: data.isWatched,
                    category: data.category,
                    name: data.name,
                    type: normalizedType ?? existing.type,
                    rarity: normalizedRarity ?? existing.rarity,
                    exterior: data.exterior ?? existing.exterior,
                },
            });
            return NextResponse.json({ success: true, data: updated });
        }

        const item = await prisma.item.create({
            data: {
                ...data,
                type: normalizedType,
                rarity: normalizedRarity,
            },
        });

        return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid item data", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /items POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
