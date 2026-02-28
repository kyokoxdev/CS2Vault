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

        const topItemsRaw = (result as unknown as { topItems: unknown }).topItems;
        const topItems =
            typeof topItemsRaw === "string" ? JSON.parse(topItemsRaw) : result.topItems;

        return NextResponse.json({
            success: true,
            data: {
                totalMarketCap: result.totalMarketCap,
                totalListings: result.totalListings,
                topItems,
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
