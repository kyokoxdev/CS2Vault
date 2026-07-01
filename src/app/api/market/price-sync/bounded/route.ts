import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth/cron";
import { runBoundedPriceSync } from "@/lib/market/bounded-price-sync";

export const maxDuration = 30;

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_MIN_AGE_MINUTES = 60;
const MIN_AGE_MINUTES = 5;
const MAX_AGE_MINUTES = 24 * 60;
const DEFAULT_BUDGET_MS = 25_000;
const MIN_BUDGET_MS = 1_000;
const MAX_BUDGET_MS = 25_000;

function parseClampedInteger(value: string | null, fallback: number, min: number, max: number): number {
    if (value === null) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;

    return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
    try {
        if (!isCronAuthorized(request)) {
            return NextResponse.json(
                { success: false, status: "error", error: "Unauthorized — invalid or missing CRON_SECRET" },
                { status: 401 }
            );
        }

        const searchParams = new URL(request.url).searchParams;
        const limit = parseClampedInteger(searchParams.get("limit"), DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
        const minAgeMinutes = parseClampedInteger(
            searchParams.get("minAgeMinutes"),
            DEFAULT_MIN_AGE_MINUTES,
            MIN_AGE_MINUTES,
            MAX_AGE_MINUTES
        );
        const budgetMs = parseClampedInteger(searchParams.get("budgetMs"), DEFAULT_BUDGET_MS, MIN_BUDGET_MS, MAX_BUDGET_MS);

        const result = await runBoundedPriceSync({ limit, minAgeMinutes, budgetMs });

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error("[BoundedPriceSyncRoute]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Bounded price sync failed" },
            { status: 500 }
        );
    }
}
