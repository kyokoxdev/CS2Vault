import { NextResponse } from "next/server";
import { getMarketCap } from "@/lib/market/market-cap";

export async function GET() {
    try {
        const result = await getMarketCap();

        if (result.status === "error" && !result.data) {
            return NextResponse.json({
                success: true,
                status: "no_data",
                data: null,
                message: result.message,
            });
        }

        return NextResponse.json({
            success: true,
            status: result.status,
            data: result.data
                ? {
                      totalMarketCap: result.data.totalMarketCap,
                      itemCount: result.data.itemCount,
                      timestamp: result.data.timestamp,
                      provider: result.data.provider,
                      source: result.data.source,
                  }
                : null,
            message: result.message,
        });
    } catch (error) {
        console.error("[API /market/market-cap]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Failed to fetch market cap data" },
            { status: 500 }
        );
    }
}
