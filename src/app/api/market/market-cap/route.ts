import { NextResponse } from "next/server";
import { fetchMarketCapData, cleanupOldSnapshots } from "@/lib/market/pricempire-trending";

export async function GET() {
    try {
        const result = await fetchMarketCapData();

        if (!result) {
            return NextResponse.json(
                { success: false, error: "Failed to fetch market cap data" },
                { status: 500 }
            );
        }

        cleanupOldSnapshots().catch((err) =>
            console.warn("[Market Cap] Cleanup error:", err)
        );

        return NextResponse.json({
            success: true,
            data: {
                totalMarketCap: result.totalMarketCap,
                timestamp: result.timestamp,
                provider: result.provider,
            },
        });
    } catch (error) {
        console.error("[API /market/market-cap]", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch market cap data" },
            { status: 500 }
        );
    }
}
