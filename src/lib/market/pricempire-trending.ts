import { prisma } from "@/lib/db";
import { pricempireQueue } from "@/lib/api-queue";

const PRICEMPIRE_API_URL = "https://api.pricempire.com/v4/paid/items/metas";

export interface MarketCapData {
    totalMarketCap: number;
    timestamp: Date;
    provider: string;
    source: "api" | "snapshot";
}

export type MarketCapStatus = "ok" | "missing_key" | "error";

export interface MarketCapResult {
    data: MarketCapData | null;
    status: MarketCapStatus;
}

let cachedResult: MarketCapResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchMarketCapData(): Promise<MarketCapResult> {
    const now = Date.now();
    if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedResult;
    }

    const apiKey = process.env.PRICEMPIRE_API_KEY;
    if (!apiKey) {
        const result: MarketCapResult = { data: null, status: "missing_key" };
        cachedResult = result;
        cacheTimestamp = now;
        return result;
    }

    const apiResult = await fetchFromApi(apiKey);
    if (apiResult) {
        await storeSnapshot(apiResult);
        const result: MarketCapResult = { data: apiResult, status: "ok" };
        cachedResult = result;
        cacheTimestamp = now;
        return result;
    }

    const snapshot = await getLastSnapshot();
    if (snapshot) {
        console.info("[Market Cap] Using DB snapshot fallback from", snapshot.timestamp.toISOString());
        const result: MarketCapResult = { data: snapshot, status: "ok" };
        cachedResult = result;
        // Shorter TTL for stale snapshots so we retry the live API sooner
        cacheTimestamp = now - CACHE_TTL_MS + 5 * 60 * 1000;
        return result;
    }

    return cachedResult ?? { data: null, status: "error" };
}

async function fetchFromApi(apiKey: string): Promise<MarketCapData | null> {
    try {
        const url = `${PRICEMPIRE_API_URL}?app_id=730`;
        const res = await pricempireQueue.enqueue(async () => {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                throw new Error(`Pricempire API error: ${response.status} ${response.statusText}`);
            }
            return response;
        });

        const items: unknown = await res.json();
        const result = parseMetasResponse(items);
        if (result) {
            console.info("[Pricempire API] Fetched market cap via V4 API");
        }
        return result;
    } catch (error) {
        console.warn("[Pricempire API] Failed:", error instanceof Error ? error.message : error);
        return null;
    }
}

function parseMetasResponse(body: unknown): MarketCapData | null {
    if (!Array.isArray(body) || body.length === 0) {
        console.warn("[Pricempire API] Empty or invalid response");
        return null;
    }

    let totalCents = 0;
    for (const item of body) {
        const raw = item?.marketcap;
        const cap = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
        if (Number.isFinite(cap) && cap > 0) {
            totalCents += cap;
        }
    }

    if (totalCents <= 0) {
        console.warn("[Pricempire API] No valid marketcap data in response");
        return null;
    }

    // Pricempire marketcap values are in cents — convert to USD
    return {
        totalMarketCap: totalCents / 100,
        timestamp: new Date(),
        provider: "pricempire",
        source: "api",
    };
}

async function getLastSnapshot(): Promise<MarketCapData | null> {
    try {
        const snapshot = await prisma.marketCapSnapshot.findFirst({
            orderBy: { timestamp: "desc" },
        });
        if (!snapshot || snapshot.totalMarketCap <= 0) return null;

        return {
            totalMarketCap: snapshot.totalMarketCap,
            timestamp: snapshot.timestamp,
            provider: snapshot.provider,
            source: "snapshot",
        };
    } catch (error) {
        console.warn("[Market Cap] DB snapshot fallback failed:", error instanceof Error ? error.message : error);
        return null;
    }
}

async function storeSnapshot(data: MarketCapData): Promise<void> {
    try {
        await prisma.marketCapSnapshot.create({
            data: {
                totalMarketCap: data.totalMarketCap,
                totalListings: 0,
                provider: data.provider,
                topItems: null,
                timestamp: data.timestamp,
            },
        });
    } catch (error) {
        console.warn("[Pricempire] Failed to store snapshot:", error instanceof Error ? error.message : error);
    }
}

export async function cleanupOldSnapshots(daysToKeep = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await prisma.marketCapSnapshot.deleteMany({
        where: { timestamp: { lt: cutoff } },
    });
    return result.count;
}
