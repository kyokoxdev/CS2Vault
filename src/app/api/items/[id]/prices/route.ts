/**
 * GET /api/items/[id]/prices — Get price history & candlestick data for an item
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const PriceQuerySchema = z.object({
    interval: z.enum(["15m", "1h", "4h", "1d", "1w"]).optional().default("1h"),
    limit: z.coerce.number().min(1).max(1000).optional().default(200),
    from: z.coerce.number().optional(), // Unix timestamp (seconds)
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Verify item exists
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return NextResponse.json(
                { success: false, error: "Item not found" },
                { status: 404 }
            );
        }

        const searchParams = Object.fromEntries(request.nextUrl.searchParams);
        const query = PriceQuerySchema.parse(searchParams);

        // Build timestamp filter
        const timestampFilter: Record<string, unknown> = {};
        if (query.from) {
            timestampFilter.gte = new Date(query.from * 1000);
        }

        // Fetch candlestick data for the requested interval
        const candlesticks = await prisma.candlestick.findMany({
            where: {
                itemId: id,
                interval: query.interval,
                ...(query.from ? { timestamp: timestampFilter } : {}),
            },
            orderBy: { timestamp: "desc" },
            take: query.limit,
        });

        const latestSnapshot = await prisma.priceSnapshot.findFirst({
            where: { itemId: id },
            orderBy: { timestamp: "desc" },
        });

        // Format candlesticks for TradingView Lightweight Charts
        const ohlcv = [...candlesticks].reverse().map((c) => ({
            time: Math.floor(c.timestamp.getTime() / 1000), // Unix seconds
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
        }));

        return NextResponse.json({
            success: true,
            data: {
                item: {
                    id: item.id,
                    name: item.name,
                    marketHashName: item.marketHashName,
                },
                interval: query.interval,
                candlesticks: ohlcv,
                latestPrice: latestSnapshot?.price ?? null,
                latestTimestamp: latestSnapshot?.timestamp ?? null,
                latestSource: latestSnapshot?.source ?? null,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid query parameters", details: error.issues },
                { status: 400 }
            );
        }
        console.error("[API /items/[id]/prices]", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
