import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const FRESH_MS = 2 * 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

type SerializedFreshness = "fresh" | "stale" | "expired";

interface LatestObservationFields {
    itemId: string;
    medianPriceCents: number | null;
    volume: number | null;
    listingCount: number | null;
}

interface CsfloatMarketFields {
    floorCents: number | null;
    supply: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRequestSearchParams(request: NextRequest): URLSearchParams {
    if ("nextUrl" in request && request.nextUrl) {
        return request.nextUrl.searchParams;
    }
    return new URL(request.url).searchParams;
}

function buildFreshnessFilter(freshness: string | null, now: Date): Record<string, unknown> {
    if (!freshness) return {};
    if (freshness === "fresh") {
        return { lastSeenAt: { gte: new Date(now.getTime() - FRESH_MS) } };
    }
    if (freshness === "stale") {
        return {
            lastSeenAt: {
                gte: new Date(now.getTime() - STALE_MS),
                lt: new Date(now.getTime() - FRESH_MS),
            },
        };
    }
    if (freshness === "expired") {
        return {
            OR: [
                { lastSeenAt: { lt: new Date(now.getTime() - STALE_MS) } },
                { lastSeenAt: null },
            ],
        };
    }
    return {};
}

function serializeFreshness(lastSeenAt: Date | null, now: Date): SerializedFreshness {
    if (!lastSeenAt) return "expired";
    const ageMs = now.getTime() - lastSeenAt.getTime();
    if (ageMs < FRESH_MS) return "fresh";
    if (ageMs < STALE_MS) return "stale";
    return "expired";
}

function buildLatestObservationMap(observations: LatestObservationFields[]): Map<string, LatestObservationFields> {
    const map = new Map<string, LatestObservationFields>();
    for (const observation of observations) {
        if (!map.has(observation.itemId)) {
            map.set(observation.itemId, observation);
        }
    }
    return map;
}

function buildCsfloatMarketMap(normalizedPayload: unknown): Map<string, CsfloatMarketFields> {
    const map = new Map<string, CsfloatMarketFields>();
    if (!isRecord(normalizedPayload) || !Array.isArray(normalizedPayload.entries)) return map;

    for (const entry of normalizedPayload.entries) {
        if (!isRecord(entry) || typeof entry.marketHashName !== "string") continue;
        map.set(entry.marketHashName, {
            floorCents: numberValue(entry.minPriceCents),
            supply: numberValue(entry.quantity),
        });
    }

    return map;
}

export async function GET(request: NextRequest) {
    try {
        const authResult = await requireAuth();
        if (authResult.error) {
            return authResult.error;
        }

        const params = getRequestSearchParams(request);
        const now = new Date();

        const signalType = params.get("signalType");
        const tier = params.get("tier");
        const freshness = params.get("freshness");
        const limitParam = params.get("limit");
        const cursor = params.get("cursor");

        const limit = Math.min(
            Math.max(1, Number(limitParam) || DEFAULT_LIMIT),
            MAX_LIMIT
        );

        const freshnessFilter = buildFreshnessFilter(freshness, now);

        let tierItemIds: string[] | null = null;
        if (tier) {
            const queueItems = await prisma.intelligenceQueueItem.findMany({
                where: { tier },
                select: { itemId: true },
            });
            tierItemIds = queueItems.map((q) => q.itemId);
        }

        const where = {
            ...(signalType ? { signalType } : {}),
            ...freshnessFilter,
            ...(tierItemIds !== null ? { itemId: { in: tierItemIds } } : {}),
        };

        const signals = await prisma.intelligenceSignal.findMany({
            where,
            orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
                item: {
                    select: {
                        id: true,
                        marketHashName: true,
                        name: true,
                    },
                },
            },
        });

        const hasMore = signals.length > limit;
        const items = signals.slice(0, limit);

        const itemIds = items.map((s) => s.itemId);
        const queueItems = tierItemIds === null
            ? await prisma.intelligenceQueueItem.findMany({
                where: { itemId: { in: itemIds } },
                select: { itemId: true, tier: true },
            })
            : [];
        const tierMap = tierItemIds === null
            ? new Map(queueItems.map((q) => [q.itemId, q.tier]))
            : new Map(
                (await prisma.intelligenceQueueItem.findMany({
                    where: { itemId: { in: itemIds } },
                    select: { itemId: true, tier: true },
                })).map((q) => [q.itemId, q.tier])
            );

        const latestObservations = itemIds.length > 0
            ? await prisma.intelligenceObservation.findMany({
                where: { itemId: { in: itemIds }, status: "observed" },
                orderBy: [{ observedAt: "desc" }, { id: "desc" }],
                select: {
                    itemId: true,
                    medianPriceCents: true,
                    volume: true,
                    listingCount: true,
                },
            })
            : [];
        const latestObservationMap = buildLatestObservationMap(latestObservations);

        const csfloatCache = itemIds.length > 0
            ? await prisma.intelligenceProviderCache.findFirst({
                where: { provider: "csfloat", lookupType: "price-list", lookupKey: "full-index" },
                orderBy: { fetchedAt: "desc" },
                select: { normalizedPayload: true },
            })
            : null;
        const csfloatMarketMap = buildCsfloatMarketMap(csfloatCache?.normalizedPayload);

        const sanitizedItems = items.map((signal) => {
            const marketHashName = (signal.item as { marketHashName: string } | null)?.marketHashName ?? null;
            const observation = latestObservationMap.get(signal.itemId);
            const csfloatMarket = marketHashName ? csfloatMarketMap.get(marketHashName) : undefined;

            return {
                id: signal.id,
                itemId: signal.itemId,
                marketHashName,
                signalType: signal.signalType,
                status: signal.status,
                confidence: signal.confidence,
                detectedAt: signal.detectedAt,
                lastSeenAt: signal.lastSeenAt,
                staleAt: signal.staleAt,
                priceCents: signal.priceCents,
                baselineCents: signal.baselineCents,
                deltaCents: signal.deltaCents,
                reasons: signal.reasons,
                freshness: serializeFreshness(signal.lastSeenAt, now),
                tier: tierMap.get(signal.itemId) ?? null,
                scmMedianCents: observation?.medianPriceCents ?? null,
                scmVolume: observation?.volume ?? null,
                csfloatFloorCents: csfloatMarket?.floorCents ?? null,
                csfloatSupply: observation?.listingCount ?? csfloatMarket?.supply ?? null,
            };
        });

        const nextCursor = hasMore ? items[items.length - 1].id : null;

        return NextResponse.json({
            success: true,
            data: {
                items: sanitizedItems,
                meta: {
                    total: sanitizedItems.length,
                    hasMore,
                    nextCursor,
                    filters: {
                        signalType: signalType ?? null,
                        tier: tier ?? null,
                        freshness: freshness ?? null,
                    },
                },
            },
        });
    } catch (error) {
        console.error("[IntelligenceRoute /signals]", error);
        return NextResponse.json(
            { success: false, status: "error", error: "Failed to fetch intelligence signals" },
            { status: 500 }
        );
    }
}
