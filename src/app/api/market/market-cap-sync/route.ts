import { NextRequest, NextResponse } from "next/server";
import { calculateAndStoreMarketCap, shouldRecalculate } from "@/lib/market/market-cap";

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { success: false, error: "Unauthorized" },
            { status: 401 }
        );
    }

    try {
        const needsRecalculation = await shouldRecalculate();
        
        if (!needsRecalculation) {
            return NextResponse.json({
                success: true,
                data: { skipped: true, reason: "Recent calculation exists" },
            });
        }

        const result = await calculateAndStoreMarketCap();

        if (result.status === "error") {
            return NextResponse.json(
                { success: false, error: result.message || "Calculation failed" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                totalMarketCap: result.data?.totalMarketCap,
                itemCount: result.data?.itemCount,
                calculatedAt: result.data?.timestamp,
            },
        });
    } catch (error) {
        console.error("[API /market/market-cap-sync]", error);
        return NextResponse.json(
            { success: false, error: "Market cap calculation failed" },
            { status: 500 }
        );
    }
}
