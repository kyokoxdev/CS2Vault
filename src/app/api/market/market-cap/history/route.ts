import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PROVIDER_NAME = "csgotrader-csfloat";

/**
 * GET /api/market/market-cap/history?limit=365
 *
 * Returns historical MarketCapSnapshot records as a time-series,
 * ordered ascending by timestamp for chart consumption.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limitParam = searchParams.get("limit");
        const limit = Math.min(Math.max(Number(limitParam) || 1500, 1), 2000);

        const snapshots = await prisma.marketCapSnapshot.findMany({
            where: { provider: PROVIDER_NAME },
            orderBy: { timestamp: "desc" },
            take: limit,
            select: {
                totalMarketCap: true,
                totalListings: true,
                timestamp: true,
            },
        });

        // Reverse to ascending order for chart display
        snapshots.reverse();

        const series = snapshots.map((s) => ({
            time: Math.floor(s.timestamp.getTime() / 1000),
            value: s.totalMarketCap,
            itemCount: s.totalListings ?? 0,
        }));

        const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

        return NextResponse.json({
            success: true,
            data: {
                series,
                count: series.length,
                latest: latest
                    ? {
                          totalMarketCap: latest.totalMarketCap,
                          itemCount: latest.totalListings ?? 0,
                          timestamp: latest.timestamp.toISOString(),
                      }
                    : null,
            },
        }, {
            headers: { "Cache-Control": "private, max-age=300" },
        });
    } catch (error) {
        console.error("[API /market/market-cap/history]", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch market cap history" },
            { status: 500 }
        );
    }
}
