/**
 * GET /api/items — List all items (with optional filters)
 * POST /api/items — Add a new item to the watchlist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeItemType, normalizeRarity } from "@/lib/market/rarity";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { mapWatchlistGroups } from "@/lib/watchlist/global-watchlist";

const PRICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days of history for sparkline
const PRICE_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h for price change %
const MAX_SPARKLINE_POINTS = 7; // one point per day, max 7 days

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

    const dayMap = new Map<number, SparklinePoint>();

    for (const snapshot of [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
        const timestamp = snapshot.timestamp.getTime();
        const dayKey = Math.floor(timestamp / (24 * 60 * 60 * 1000));

        if (!dayMap.has(dayKey)) {
            dayMap.set(dayKey, {
                time: Math.floor(timestamp / 1000),
                value: snapshot.price,
            });
        }
    }

    return sampleSparkline([...dayMap.values()]);
}

function calculatePriceChange24h(snapshots: Array<{ price: number; timestamp: Date }>): number {
    if (snapshots.length < 2) {
        return 0;
    }

    const latest = snapshots[0];
    const earliest = snapshots[snapshots.length - 1];

    if (!latest || !earliest || earliest.price <= 0) {
        return 0;
    }

    return ((latest.price - earliest.price) / earliest.price) * 100;
}

export async function GET(request: NextRequest) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const params = Object.fromEntries(request.nextUrl.searchParams);
        const query = ItemQuerySchema.parse(params);
        const cutoff7d = new Date(Date.now() - PRICE_WINDOW_MS);
        const cutoff24h = new Date(Date.now() - PRICE_CHANGE_WINDOW_MS);

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
                        where: { source: { not: "steam-intelligence" } },
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
                    timestamp: { gte: cutoff7d },
                    source: { not: "steam-intelligence" },
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
            const snapshots7d = snapshotsByItemId.get(item.id) ?? [];
            const snapshots24h = snapshots7d.filter((s) => s.timestamp >= cutoff24h);

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
                groups: mapWatchlistGroups(item.groups),
                isWatched: item.isWatched,
                currentPrice: latestSnapshot?.price ?? null,
                priceChange24h: calculatePriceChange24h(snapshots24h),
                sparkline: buildSparkline(snapshots7d),
                priceSource: latestSnapshot?.source ?? null,
                lastUpdated: latestSnapshot?.timestamp ?? null,
            };
        });

        let lastPriceUpdate: Date | null = null;
        for (const item of items) {
            const ts = item.priceSnapshots[0]?.timestamp;
            if (ts && (!lastPriceUpdate || ts > lastPriceUpdate)) {
                lastPriceUpdate = ts;
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                items: formatted,
                total,
                limit: query.limit,
                offset: query.offset,
                hasMore: query.offset + formatted.length < total,
                lastPriceUpdate: lastPriceUpdate?.toISOString() ?? null,
            },
        }, {
            headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
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
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

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
                        imageUrl: data.imageUrl ?? existing.imageUrl,
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
                    category: data.category,
                    isWatched: data.isWatched,
                    name: data.name,
                    imageUrl: data.imageUrl ?? existing.imageUrl,
                    type: normalizedType ?? existing.type,
                    rarity: normalizedRarity ?? existing.rarity,
                    exterior: data.exterior ?? existing.exterior,
                },
            });
            return NextResponse.json({ success: true, data: updated });
        }

        const item = await prisma.item.create({
            data: {
                marketHashName: data.marketHashName,
                name: data.name,
                weapon: data.weapon,
                skin: data.skin,
                category: data.category,
                isWatched: data.isWatched,
                type: normalizedType,
                rarity: normalizedRarity,
                exterior: data.exterior,
                imageUrl: data.imageUrl,
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
