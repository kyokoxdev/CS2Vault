import { execFile } from "child_process";
import { prisma } from "@/lib/db";

const CHART_URL = "https://pricempire.com/api-data/v1/trending/chart?provider=csfloat";

const BROWSER_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: "https://pricempire.com/app/trending",
};

async function nativeFetch(url: string): Promise<string> {
    const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        throw new Error(`fetch ${res.status} ${res.statusText}`);
    }
    return res.text();
}

// curl bypasses Cloudflare JA3/JA4 TLS fingerprinting that blocks Node.js fetch
function curlFetch(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            execFile(
                "curl",
                [
                    "-s",
                    "-f",
                    "--max-time", "10",
                    ...Object.entries(BROWSER_HEADERS).flatMap(([k, v]) => ["-H", `${k}: ${v}`]),
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
        } catch (err) {
            // execFile itself can throw if the binary is not found
            reject(new Error(`curl unavailable: ${err instanceof Error ? err.message : err}`));
        }
    });
}

export interface MarketCapData {
    totalMarketCap: number;
    timestamp: Date;
    provider: string;
    source: "chart" | "formula" | "snapshot";
}

let cachedData: MarketCapData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchMarketCapData(): Promise<MarketCapData | null> {
    const now = Date.now();
    if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedData;
    }

    // Try live chart API (native fetch → curl fallback)
    const chartResult = await fetchFromChartApi();
    if (chartResult) {
        await storeSnapshot(chartResult);
        cachedData = chartResult;
        cacheTimestamp = now;
        return chartResult;
    }

    const snapshot = await getLastSnapshot();
    if (snapshot) {
        console.info("[Market Cap] Using DB snapshot fallback from", snapshot.timestamp.toISOString());
        cachedData = snapshot;
        // Shorter TTL for stale snapshots so we retry live fetch sooner
        cacheTimestamp = now - CACHE_TTL_MS + 5 * 60 * 1000;
        return snapshot;
    }

    return cachedData;
}

function parseChartResponse(body: string): MarketCapData | null {
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
}

async function fetchFromChartApi(): Promise<MarketCapData | null> {
    try {
        const body = await nativeFetch(CHART_URL);
        const result = parseChartResponse(body);
        if (result) {
            console.info("[Pricempire Chart] Fetched via native fetch");
            return result;
        }
    } catch (error) {
        console.warn("[Pricempire Chart] fetch failed:", error instanceof Error ? error.message : error);
    }

    try {
        const body = await curlFetch(CHART_URL);
        const result = parseChartResponse(body);
        if (result) {
            console.info("[Pricempire Chart] Fetched via curl");
            return result;
        }
    } catch (error) {
        console.warn("[Pricempire Chart] curl failed:", error instanceof Error ? error.message : error);
    }

    return null;
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
