import { NextRequest, NextResponse } from "next/server";
import { calculateAndStoreMarketCap, shouldRecalculate } from "@/lib/market/market-cap";
import { requireAuth } from "@/lib/auth/guard";

async function authorize(request: NextRequest): Promise<NextResponse | null> {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return null;
    }

    const authResult = await requireAuth();
    return authResult.error;
}

async function runMarketCapSync(request: NextRequest, forceRecalculate: boolean) {
    const authError = await authorize(request);
    if (authError) {
        return authError;
    }

    try {
        const needsRecalculation = forceRecalculate || await shouldRecalculate();
        
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

export async function GET(request: NextRequest) {
    return runMarketCapSync(request, false);
}

export async function POST(request: NextRequest) {
    return runMarketCapSync(request, true);
}
