/**
 * GET /api/market/summary — Estimated market cap (CSFloat liquidity proxy)
 */

import { NextResponse } from "next/server";
import { csfloatQueue } from "@/lib/api-queue";
import { isSyncLocked } from "@/lib/market/sync-lock";
import { prisma } from "@/lib/db";

const CSFLOAT_BASE_URL = "https://csfloat.com/api/v1";
const CSFLOAT_PAGE_LIMIT = 50;
const CSFLOAT_TARGET_ITEMS = 500;
const CSFLOAT_MAX_PAGES = 5;
const CSFLOAT_CACHE_MS = 30 * 60 * 1000;
const BASE_TURNOVER_DAYS = 30;
const MIN_TURNOVER_DAYS = 7;
const MAX_TURNOVER_DAYS = 90;

interface SummaryData {
    marketCapUsd: number | null;
    source: string;
    sampleSize: number;
    computedAt: string;
    status: "ok" | "missing_key" | "no_data" | "error";
}

let cachedSummary: SummaryData | null = null;
let cachedAt = 0;

const DB_CACHE_ID = "market-summary";

async function loadDbCache(): Promise<{ data: SummaryData; updatedAt: Date } | null> {
    try {
        const row = await prisma.bulkPriceCache.findUnique({ where: { id: DB_CACHE_ID } });
        if (!row) return null;
        const data = JSON.parse(row.data) as SummaryData;
        return { data, updatedAt: row.updatedAt };
    } catch {
        return null;
    }
}

async function saveDbCache(data: SummaryData): Promise<void> {
    try {
        await prisma.bulkPriceCache.upsert({
            where: { id: DB_CACHE_ID },
            create: { id: DB_CACHE_ID, data: JSON.stringify(data), updatedAt: new Date() },
            update: { data: JSON.stringify(data), updatedAt: new Date() },
        });
    } catch (err) {
        console.warn("[Market Summary] Failed to persist DB cache:", err);
    }
}

interface CSFloatListing {
    id?: string;
    price?: number;
    item?: {
        market_hash_name?: string;
        scm?: {
            price?: number;
            volume?: number;
        };
    };
}

interface ItemStat {
    scmPriceCents?: number;
    scmVolume?: number;
    listingCount: number;
    listingPrices: number[];
}

function getCSFloatApiKey(): string {
    const key = process.env.CSFLOAT_API_KEY;
    if (!key) throw new Error("CSFLOAT_API_KEY is not configured");
    return key;
}

function getHeaders(): HeadersInit {
    return {
        Authorization: getCSFloatApiKey(),
        "Content-Type": "application/json",
    };
}

function safeMarketCapValue(raw: number | undefined): number {
    if (!raw || raw <= 0 || !Number.isFinite(raw)) return 0;
    return raw;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}


function parseListingsResponse(data: unknown): { listings: CSFloatListing[]; nextCursor?: string } {
    if (Array.isArray(data)) {
        const last = data[data.length - 1] as CSFloatListing | undefined;
        return {
            listings: data as CSFloatListing[],
            nextCursor: last?.id,
        };
    }

    if (!data || typeof data !== "object") {
        return { listings: [] };
    }

    const record = data as Record<string, unknown>;
    const listings = Array.isArray(record.listings)
        ? (record.listings as CSFloatListing[])
        : Array.isArray(record.data)
            ? (record.data as CSFloatListing[])
            : Array.isArray(record.results)
                ? (record.results as CSFloatListing[])
                : [];
    const nextCursor =
        (record.next_cursor as string | undefined)
        ?? (record.nextCursor as string | undefined)
        ?? (record.cursor as string | undefined)
        ?? listings[listings.length - 1]?.id;

    return { listings, nextCursor };
}

async function fetchListingsPage(cursor?: string): Promise<{ listings: CSFloatListing[]; nextCursor?: string }> {
    const url = new URL(`${CSFLOAT_BASE_URL}/listings`);
    url.searchParams.set("sort_by", "best_deal");
    url.searchParams.set("limit", CSFLOAT_PAGE_LIMIT.toString());
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = await csfloatQueue.enqueue(async () => {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) {
            throw new Error(`CSFloat listings error: ${res.status}`);
        }
        return res.json();
    });

    return parseListingsResponse(data);
}

function buildItemStats(listings: CSFloatListing[]): Map<string, ItemStat> {
    const stats = new Map<string, ItemStat>();
    for (const listing of listings) {
        const hashName = listing.item?.market_hash_name;
        if (!hashName) continue;

        const scmPrice = safeMarketCapValue(listing.item?.scm?.price);
        const scmVolume = safeMarketCapValue(listing.item?.scm?.volume);
        const listingPrice = safeMarketCapValue(listing.price);
        const existing = stats.get(hashName) ?? { listingCount: 0, listingPrices: [] };

        existing.listingCount += 1;
        if (listingPrice > 0) {
            existing.listingPrices.push(listingPrice);
        }
        if (scmPrice > 0) existing.scmPriceCents = scmPrice;
        if (scmVolume > 0) {
            existing.scmVolume = Math.max(existing.scmVolume ?? 0, scmVolume);
        }

        stats.set(hashName, existing);
    }

    return stats;
}

function pickTopItems(stats: Map<string, ItemStat>): string[] {
    return [...stats.entries()]
        .map(([hashName, stat]) => ({
            hashName,
            liquidity: stat.scmVolume && stat.scmVolume > 0 ? stat.scmVolume : stat.listingCount,
        }))
        .filter((item) => item.liquidity > 0)
        .sort((a, b) => b.liquidity - a.liquidity)
        .slice(0, CSFLOAT_TARGET_ITEMS)
        .map((item) => item.hashName);
}

export async function GET() {
    try {
        if (!process.env.CSFLOAT_API_KEY) {
            return NextResponse.json({
                success: true,
                data: { marketCapUsd: null, source: "csfloat", status: "missing_key" },
            });
        }

        if (cachedSummary && Date.now() - cachedAt < CSFLOAT_CACHE_MS) {
            return NextResponse.json({
                success: true,
                data: cachedSummary,
            }, {
                headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
            });
        }

        const dbCache = await loadDbCache();
        if (dbCache && Date.now() - dbCache.updatedAt.getTime() < CSFLOAT_CACHE_MS) {
            cachedSummary = dbCache.data;
            cachedAt = dbCache.updatedAt.getTime();
            return NextResponse.json({
                success: true,
                data: dbCache.data,
            }, {
                headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
            });
        }

        if (await isSyncLocked()) {
            const fallback = cachedSummary ?? dbCache?.data ?? { marketCapUsd: null, source: "csfloat", status: "no_data" as const };
            return NextResponse.json({
                success: true,
                data: fallback,
            });
        }

        const listingsByPage: CSFloatListing[] = [];
        let cursor: string | undefined;
        let page = 0;

        while (page < CSFLOAT_MAX_PAGES) {
            const { listings, nextCursor } = await fetchListingsPage(cursor);
            if (!listings.length) break;
            listingsByPage.push(...listings);
            if (!nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
            page += 1;
        }

        const itemStats = buildItemStats(listingsByPage);
        if (itemStats.size === 0) {
            return NextResponse.json({
                success: true,
                data: { marketCapUsd: null, source: "csfloat", status: "no_data" },
            });
        }

        const topItems = pickTopItems(itemStats);
        if (!topItems.length) {
            return NextResponse.json({
                success: true,
                data: { marketCapUsd: null, source: "csfloat", status: "no_data" },
            });
        }

        const depthSamples = [...itemStats.values()]
            .map((stat) => {
                if (!stat.scmVolume || stat.scmVolume <= 0 || stat.listingCount <= 0) return 0;
                return stat.listingCount / stat.scmVolume;
            })
            .filter((value) => value > 0);
        const medianDepth = depthSamples.length ? median(depthSamples) : 0;

        let marketCapUsd = 0;
        let sampled = 0;

        for (const hashName of topItems) {
            const stat = itemStats.get(hashName);
            if (!stat) continue;

            const listingMedian = median(stat.listingPrices);
            let priceCents = stat.scmPriceCents && stat.scmPriceCents > 0
                ? stat.scmPriceCents
                : listingMedian;
            if (stat.scmPriceCents && listingMedian > 0) {
                const ratio = stat.scmPriceCents / listingMedian;
                if (ratio > 2 || ratio < 0.5) {
                    priceCents = listingMedian;
                }
            }
            const priceUsd = priceCents / 100;
            if (priceUsd <= 0) continue;

            let supply = 0;
            if (stat.scmVolume && stat.scmVolume > 0) {
                const depth = stat.listingCount > 0 ? stat.listingCount / stat.scmVolume : 0;
                const turnoverDays = medianDepth > 0
                    ? clampNumber(
                        BASE_TURNOVER_DAYS * (depth / medianDepth),
                        MIN_TURNOVER_DAYS,
                        MAX_TURNOVER_DAYS
                    )
                    : BASE_TURNOVER_DAYS;
                supply = stat.scmVolume * turnoverDays;
            } else {
                supply = stat.listingCount;
            }
            if (supply <= 0) continue;

            marketCapUsd += priceUsd * supply;
            sampled += 1;
        }

        if (marketCapUsd <= 0 || sampled === 0) {
            return NextResponse.json({
                success: true,
                data: { marketCapUsd: null, source: "csfloat", status: "no_data" },
            });
        }

        const computedSummary: SummaryData = {
            marketCapUsd,
            source: "csfloat",
            sampleSize: sampled,
            computedAt: new Date().toISOString(),
            status: "ok",
        };
        cachedSummary = computedSummary;
        cachedAt = Date.now();

        await saveDbCache(computedSummary);

        return NextResponse.json({
            success: true,
            data: computedSummary,
        }, {
            headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
        });
    } catch (error) {
        console.warn("[API /market/summary]", error);
        return NextResponse.json({
            success: true,
            data: { marketCapUsd: null, source: "csfloat", status: "error" },
        });
    }
}
