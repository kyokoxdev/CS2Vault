import { prisma } from "@/lib/db";

const CSGOTRADER_CSFLOAT_URL = "https://prices.csgotrader.app/latest/csfloat.json";
const PROVIDER_NAME = "csgotrader-csfloat";
const CACHE_MAX_AGE_HOURS = 25;

export interface MarketCapData {
    totalMarketCap: number;
    itemCount: number;
    timestamp: Date;
    provider: string;
    source: "calculated" | "snapshot";
}

export type MarketCapStatus = "ok" | "stale" | "error" | "calculating";

export interface MarketCapResult {
    data: MarketCapData | null;
    status: MarketCapStatus;
    message?: string;
}

/**
 * Get cached market cap from DB. Called by API route - never triggers calculation.
 */
export async function getMarketCap(): Promise<MarketCapResult> {
    try {
        const snapshot = await prisma.marketCapSnapshot.findFirst({
            where: { provider: PROVIDER_NAME },
            orderBy: { timestamp: "desc" },
        });

        if (!snapshot || snapshot.totalMarketCap <= 0) {
            return {
                data: null,
                status: "error",
                message: "No market cap data available. Waiting for cron calculation.",
            };
        }

        const ageHours = (Date.now() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
        const isStale = ageHours > CACHE_MAX_AGE_HOURS;

        return {
            data: {
                totalMarketCap: snapshot.totalMarketCap,
                itemCount: snapshot.totalListings ?? 0,
                timestamp: snapshot.timestamp,
                provider: snapshot.provider,
                source: "snapshot",
            },
            status: isStale ? "stale" : "ok",
            message: isStale
                ? `Data is ${Math.round(ageHours)} hours old. Cron may have failed.`
                : undefined,
        };
    } catch (error) {
        console.error("[Market Cap] Failed to get snapshot:", error);
        return {
            data: null,
            status: "error",
            message: error instanceof Error ? error.message : "Database error",
        };
    }
}

/**
 * Calculate market cap from CSGOTrader csfloat.json.
 * ONLY called by cron job - loads full 10MB JSON which is acceptable in isolated cron execution.
 */
export async function calculateAndStoreMarketCap(): Promise<MarketCapResult> {
    console.info("[Market Cap Cron] Starting calculation from CSGOTrader csfloat.json");
    const startTime = Date.now();

    try {
        const response = await fetch(CSGOTRADER_CSFLOAT_URL, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            throw new Error(`CSGOTrader API error: ${response.status} ${response.statusText}`);
        }

        const data: Record<string, { price: number | null }> = await response.json();

        let totalMarketCap = 0;
        let itemCount = 0;

        for (const entry of Object.values(data)) {
            const price = entry?.price;
            if (typeof price === "number" && Number.isFinite(price) && price > 0) {
                totalMarketCap += price;
                itemCount++;
            }
        }

        const duration = Date.now() - startTime;
        console.info(
            `[Market Cap Cron] Calculated: $${totalMarketCap.toLocaleString()} from ${itemCount} items in ${duration}ms`
        );

        const snapshot = await prisma.marketCapSnapshot.create({
            data: {
                totalMarketCap,
                totalListings: itemCount,
                provider: PROVIDER_NAME,
                topItems: null,
                timestamp: new Date(),
            },
        });

        await cleanupOldSnapshots(7);

        return {
            data: {
                totalMarketCap: snapshot.totalMarketCap,
                itemCount: snapshot.totalListings ?? itemCount,
                timestamp: snapshot.timestamp,
                provider: PROVIDER_NAME,
                source: "calculated",
            },
            status: "ok",
        };
    } catch (error) {
        console.error("[Market Cap Cron] Calculation failed:", error);
        return {
            data: null,
            status: "error",
            message: error instanceof Error ? error.message : "Calculation failed",
        };
    }
}

async function cleanupOldSnapshots(daysToKeep: number): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await prisma.marketCapSnapshot.deleteMany({
        where: {
            provider: PROVIDER_NAME,
            timestamp: { lt: cutoff },
        },
    });
    if (result.count > 0) {
        console.info(`[Market Cap] Cleaned up ${result.count} old snapshots`);
    }
    return result.count;
}

export async function shouldRecalculate(): Promise<boolean> {
    const snapshot = await prisma.marketCapSnapshot.findFirst({
        where: { provider: PROVIDER_NAME },
        orderBy: { timestamp: "desc" },
    });

    if (!snapshot) return true;

    const ageHours = (Date.now() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    return ageHours > 20;
}
