import { execFile } from "child_process";
import { prisma } from "@/lib/db";

const CHART_URL = "https://pricempire.com/api-data/v1/trending/chart?provider=csfloat";

/**
 * Fetch URL via curl subprocess to bypass Cloudflare TLS fingerprinting.
 * Node.js fetch/https get 403'd due to JA3/JA4 fingerprint detection,
 * but curl has a different TLS implementation that passes.
 */
function curlFetch(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            "curl",
            [
                "-s",
                "-f",
                "--max-time", "10",
                "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "-H", "Accept: application/json, text/plain, */*",
                "-H", "Referer: https://pricempire.com/app/trending",
                url,
            ],
            { timeout: 15_000, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`curl failed: ${error.message}${stderr ? ` — ${stderr}` : ""}`));
                    return;
                }
                resolve(stdout);
            },
        );
    });
}

export interface MarketCapData {
    totalMarketCap: number;
    timestamp: Date;
    provider: string;
    source: "chart" | "formula";
}

let cachedData: MarketCapData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchMarketCapData(): Promise<MarketCapData | null> {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedData;
    }

    const chartResult = await fetchFromChartApi();
    if (chartResult) {
        await storeSnapshot(chartResult);
        cachedData = chartResult;
        cacheTimestamp = now;
        return chartResult;
    }

    return cachedData;
}

async function fetchFromChartApi(): Promise<MarketCapData | null> {
    try {
        const body = await curlFetch(CHART_URL);

        const json: unknown = JSON.parse(body);
        if (!Array.isArray(json) || json.length === 0) {
            console.warn("[Pricempire Chart] Empty or invalid response");
            return null;
        }

        const latest = json[json.length - 1] as { date?: string; value?: number };
        if (typeof latest.value !== "number" || latest.value <= 0) {
            console.warn("[Pricempire Chart] Invalid latest entry:", latest);
            return null;
        }

        // Chart API returns values in cents — convert to USD
        const marketCapUsd = latest.value / 100;

        return {
            totalMarketCap: marketCapUsd,
            timestamp: new Date(),
            provider: "csfloat",
            source: "chart",
        };
    } catch (error) {
        console.warn("[Pricempire Chart] Error:", error instanceof Error ? error.message : error);
        return null;
    }
}

async function fetchSummaryFallback(): Promise<MarketCapData | null> {
    try {
        const port = process.env.PORT || "3000";
        const res = await fetch(`http://localhost:${port}/api/market/summary`);
        if (!res.ok) {
            console.warn(`[Pricempire Fallback] Summary fetch failed: ${res.status}`);
            return null;
        }

        const json = await res.json();
        const marketCapUsd = json?.data?.marketCapUsd;
        if (typeof marketCapUsd !== "number" || marketCapUsd <= 0) {
            console.warn("[Pricempire Fallback] No valid marketCapUsd from summary");
            return null;
        }

        return {
            totalMarketCap: marketCapUsd,
            timestamp: new Date(),
            provider: "csfloat",
            source: "formula",
        };
    } catch (error) {
        console.warn("[Pricempire Fallback] Error:", error instanceof Error ? error.message : error);
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
