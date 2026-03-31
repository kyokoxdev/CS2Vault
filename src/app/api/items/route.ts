/**
 * GET /api/items — List all items (with optional filters)
 * POST /api/items — Add a new item to the watchlist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeItemType, normalizeRarity } from "@/lib/market/rarity";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";

const PRICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SPARKLINE_POINTS = 20;

type SparklinePoint = { time: number; value: number };

const ItemQuerySchema = z.object({
    watched: z.enum(["true", "false", "all"]).optional(),
    category: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().min(1).max(200).optional().default(50),
    offset: z.coerce.number().min(0).optional().default(0),
    sortBy: z.string().optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
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

function mapGroups(groups: Array<{ group: { id: string; name: string; color: string | null } }>) {
    return groups.map(({ group }) => ({
        id: group.id,
        name: group.name,
        color: group.color,
    }));
}

function sampleSparkline(points: SparklinePoint[]): SparklinePoint[] {
    if (points.length <= MAX_SPARKLINE_POINTS) {
        return points;
    }

    const sampled: SparklinePoint[] = [];

    for (let index = 0; index < MAX_SPARKLINE_POINTS; index += 1) {
        const pointIndex = index === MAX_SPARKLINE_POINTS - 1
            ? points.length - 1
            : Math.floor((index * points.length) / MAX_SPARKLINE_POINTS);
        const point = points[pointIndex];

        if (!point) {
            continue;
        }

        if (sampled[sampled.length - 1]?.time !== point.time) {
            sampled.push(point);
        }
    }

    return sampled;
}

function buildSparkline(snapshots: Array<{ price: number; timestamp: Date }>): SparklinePoint[] {
    if (snapshots.length === 0) {
        return [];
    }

    const hourMap = new Map<number, SparklinePoint>();

    for (const snapshot of [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
        const timestamp = snapshot.timestamp.getTime();
        const hourKey = Math.floor(timestamp / 3600000);

        if (!hourMap.has(hourKey)) {
            hourMap.set(hourKey, {
                time: Math.floor(timestamp / 1000),
                value: snapshot.price,
            });
        }
    }

    return sampleSparkline([...hourMap.values()]);
}

function calculatePriceChange24h(snapshots: Array<{ price: number; timestamp: Date }>): number | null {
    if (snapshots.length < 2) {
        return null;
    }

    const latest = snapshots[0];
    const earliest = snapshots[snapshots.length - 1];

    if (!latest || !earliest || earliest.price <= 0) {
        return null;
    }

    return ((latest.price - earliest.price) / earliest.price) * 100;
}

export async function GET(request: NextRequest) {
    try {
        const params = Object.fromEntries(request.nextUrl.searchParams);
        const query = ItemQuerySchema.parse(params);
        const cutoff24h = new Date(Date.now() - PRICE_WINDOW_MS);

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

        const direction = query.sortDir === "desc" ? "desc" : "asc";
        let orderBy: { name: "asc" | "desc" } | { createdAt: "asc" | "desc" } | { marketHashName: "asc" | "desc" };

        switch (query.sortBy) {
            case "createdAt":
                orderBy = { createdAt: direction };
                break;
            case "marketHashName":
                orderBy = { marketHashName: direction };
                break;
            default:
                orderBy = { name: direction };
                break;
        }

        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                include: {
                    priceSnapshots: {
                        orderBy: { timestamp: "desc" },
                        take: 1,
                    },
                    groups: {
                        include: {
                            group: true,
                        },
                    },
                },
                orderBy,
                take: query.limit,
                skip: query.offset,
            }),
            prisma.item.count({ where }),
        ]);

        const itemIds = items.map((item) => item.id);
        const priceSnapshots = itemIds.length > 0
            ? await prisma.priceSnapshot.findMany({
                where: {
                    itemId: { in: itemIds },
                    timestamp: { gte: cutoff24h },
                },
                select: {
                    itemId: true,
                    price: true,
                    timestamp: true,
                },
                orderBy: [
                    { itemId: "asc" },
                    { timestamp: "desc" },
                ],
            })
            : [];

        const snapshotsByItemId = new Map<string, Array<{ price: number; timestamp: Date }>>();
        for (const snapshot of priceSnapshots) {
            const existing = snapshotsByItemId.get(snapshot.itemId) ?? [];
            existing.push({
                price: snapshot.price,
                timestamp: snapshot.timestamp,
            });
            snapshotsByItemId.set(snapshot.itemId, existing);
        }

        // Format response with latest price
        const formatted = items.map((item) => {
            const latestSnapshot = item.priceSnapshots[0];
            const snapshots24h = snapshotsByItemId.get(item.id) ?? [];

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
                notes: item.notes,
                groups: mapGroups(item.groups),
                isWatched: item.isWatched,
                currentPrice: latestSnapshot?.price ?? null,
                priceChange24h: calculatePriceChange24h(snapshots24h),
                sparkline: buildSparkline(snapshots24h),
                priceSource: latestSnapshot?.source ?? null,
                lastUpdated: latestSnapshot?.timestamp ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                items: formatted,
                total,
                limit: query.limit,
                offset: query.offset,
                hasMore: query.offset + formatted.length < total,
            },
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
