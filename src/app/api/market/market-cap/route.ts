import { NextResponse } from "next/server";
import { fetchMarketCapData, cleanupOldSnapshots } from "@/lib/market/pricempire-trending";

export async function GET() {
    try {
        const result = await fetchMarketCapData();

        if (result.status === "missing_key") {
            return NextResponse.json({
                success: true,
                status: "missing_key",
                data: null,
            });
        }

        if (!result.data) {
            return NextResponse.json(
                { success: false, status: "error", error: "Failed to fetch market cap data" },
                { status: 500 }
            );
        }

        cleanupOldSnapshots().catch((err) =>
            console.warn("[Market Cap] Cleanup error:", err)
        );

        return NextResponse.json({
            success: true,
            status: "ok",
            data: {
                totalMarketCap: result.data.totalMarketCap,
                timestamp: result.data.timestamp,
                provider: result.data.provider,
                source: result.data.source,
            },
        });
    } catch (error) {
        console.error("[API /market/market-cap]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Failed to fetch market cap data" },
            { status: 500 }
        );
    }
}
