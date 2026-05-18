import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { seedIntelligenceCatalog } from "@/lib/market/intelligence/catalog";

async function authorize(request: NextRequest): Promise<NextResponse | null> {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return null;
    }

    const authResult = await requireAuth();
    return authResult.error;
}

export async function POST(request: NextRequest) {
    try {
        const authError = await authorize(request);
        if (authError) {
            return authError;
        }

        const body = await request.json().catch(() => ({}));
        const cursor = typeof body.cursor === "number" ? body.cursor : undefined;
        const cap = typeof body.cap === "number" ? body.cap : undefined;

        const result = await seedIntelligenceCatalog({ cursor, cap });

        if (result.status === "failed") {
            return NextResponse.json(
                { success: false, status: "error", error: result.error ?? "Catalog seeding failed" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                seeded: result.seeded,
                disabled: result.disabled,
                skipped: result.skipped,
                progress: result.progress,
            },
        });
    } catch (error) {
        console.error("[IntelligenceRoute /seed]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Catalog seeding failed" },
            { status: 500 }
        );
    }
}