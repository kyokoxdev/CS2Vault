import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
    const cacheRows = new Map<string, {
        provider: string;
        lookupType: string;
        lookupKey: string;
        itemId: string | null;
        rawPayload: unknown;
        normalizedPayload: unknown;
        fetchedAt: Date;
        expiresAt: Date | null;
    }>();
    const config = {
        liveScmEnabled: true,
        circuitBreakerUntil: null as Date | null,
    };

    return {
        cacheRows,
        config,
        intelligenceProviderCache: {
            findUnique: vi.fn(async ({ where }: { where: { provider_lookupType_lookupKey: { provider: string; lookupType: string; lookupKey: string } } }) => {
                const key = `${where.provider_lookupType_lookupKey.provider}:${where.provider_lookupType_lookupKey.lookupType}:${where.provider_lookupType_lookupKey.lookupKey}`;
                return cacheRows.get(key) ?? null;
            }),
            upsert: vi.fn(async ({ where, update, create }: {
                where: { provider_lookupType_lookupKey: { provider: string; lookupType: string; lookupKey: string } };
                update: Record<string, unknown>;
                create: Record<string, unknown>;
            }) => {
                const key = `${where.provider_lookupType_lookupKey.provider}:${where.provider_lookupType_lookupKey.lookupType}:${where.provider_lookupType_lookupKey.lookupKey}`;
                const next = cacheRows.has(key) ? { ...cacheRows.get(key), ...update } : create;
                const row = {
                    provider: next.provider as string,
                    lookupType: next.lookupType as string,
                    lookupKey: next.lookupKey as string,
                    itemId: (next.itemId as string | null | undefined) ?? null,
                    rawPayload: next.rawPayload,
                    normalizedPayload: next.normalizedPayload,
                    fetchedAt: next.fetchedAt as Date,
                    expiresAt: (next.expiresAt as Date | null | undefined) ?? null,
                };
                cacheRows.set(key, row);
                return row;
            }),
        },
        intelligenceConfig: {
            findUnique: vi.fn(async () => ({
                id: "default",
                liveScmEnabled: config.liveScmEnabled,
                circuitBreakerUntil: config.circuitBreakerUntil,
                consecutiveProviderFailures: 0,
                lastError: null,
            })),
            upsert: vi.fn(async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
                const source = update.circuitBreakerUntil !== undefined ? update : create;
                config.circuitBreakerUntil = (source.circuitBreakerUntil as Date | null | undefined) ?? null;
                return {
                    id: "default",
                    liveScmEnabled: config.liveScmEnabled,
                    circuitBreakerUntil: config.circuitBreakerUntil,
                };
            }),
        },
    };
});

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceProviderCache: mockDb.intelligenceProviderCache,
        intelligenceConfig: mockDb.intelligenceConfig,
    },
}));

import { prisma } from "@/lib/db";
import {
    fetchCsfloatPriceList,
    fetchCsfloatPriceListEntry,
    fetchScmPriceOverview,
    parseScmPriceOverview,
} from "@/lib/market/intelligence/providers";

const NOW = new Date("2026-05-15T12:00:00.000Z");

const immediateQueue = {
    enqueue: async <T>(execute: () => Promise<T>) => execute(),
};

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status });
}

function textResponse(payload: string, status = 200): Response {
    return new Response(payload, { status });
}

function cacheKey(provider: string, lookupType: string, lookupKey: string): string {
    return `${provider}:${lookupType}:${lookupKey}`;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.cacheRows.clear();
    mockDb.config.liveScmEnabled = true;
    mockDb.config.circuitBreakerUntil = null;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("parseScmPriceOverview", () => {
    it("normalizes lowest, median, and volume into integer cents", () => {
        const result = parseScmPriceOverview("AK-47 | Redline (Field-Tested)", {
            success: true,
            lowest_price: "$7.90",
            median_price: "$7.77",
            volume: "1,113",
        });

        expect(result.ok).toBe(true);
        expect(result.source).toBe("scm");
        expect(result.rawPayload).toEqual({
            success: true,
            lowest_price: "$7.90",
            median_price: "$7.77",
            volume: "1,113",
        });
        expect(result.normalized).toEqual({
            marketHashName: "AK-47 | Redline (Field-Tested)",
            lowestPriceCents: 790,
            medianPriceCents: 777,
            volume: 1113,
        });
    });

    it("accepts missing volume as null", () => {
        const result = parseScmPriceOverview("No Volume", {
            success: true,
            lowest_price: "$150.00",
            median_price: "$145.00",
        });

        expect(result.ok).toBe(true);
        expect(result.normalized?.volume).toBeNull();
    });

    it("flags malformed prices", () => {
        const result = parseScmPriceOverview("Bad Price", {
            success: true,
            lowest_price: "N/A",
            median_price: "",
        });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("NO_PRICE_DATA");
        expect(result.failure?.circuitBreakerOpen).toBe(false);
    });

    it("signals SCM success:false as provider unsuccessful", () => {
        const result = parseScmPriceOverview("Not Marketable", { success: false });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("PROVIDER_UNSUCCESSFUL");
        expect(result.rawPayload).toEqual({ success: false });
    });
});

describe("fetchScmPriceOverview", () => {
    it("fetches SCM with encoded query params, rotates a browser User-Agent, caches raw and normalized payloads", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({
            success: true,
            lowest_price: "$12.35",
            median_price: "$12.10",
            volume: "84,984",
        }));

        const result = await fetchScmPriceOverview("M4A1-S | Printstream (Field-Tested)", {
            fetchImpl,
            queue: immediateQueue,
            now: NOW,
        });

        expect(result.ok).toBe(true);
        expect(result.normalized?.lowestPriceCents).toBe(1235);
        expect(Number.isInteger(result.normalized?.lowestPriceCents)).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toContain("appid=730");
        expect(url).toContain("currency=1");
        expect(url).toContain("market_hash_name=M4A1-S+%7C+Printstream+%28Field-Tested%29");
        expect(init?.headers).toHaveProperty("User-Agent");

        const row = mockDb.cacheRows.get(cacheKey("scm", "market_hash_name", "M4A1-S | Printstream (Field-Tested)"));
        expect(row?.rawPayload).toEqual({
            success: true,
            lowest_price: "$12.35",
            median_price: "$12.10",
            volume: "84,984",
        });
        expect(row?.normalizedPayload).toEqual(result.normalized);
    });

    it("uses a fresh TTL cache hit and avoids a repeated SCM fetch", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({
            success: true,
            lowest_price: "$1.23",
            median_price: "$1.20",
        }));

        const first = await fetchScmPriceOverview("Cached Item", { fetchImpl, queue: immediateQueue, now: NOW });
        const second = await fetchScmPriceOverview("Cached Item", { fetchImpl, queue: immediateQueue, now: new Date(NOW.getTime() + 60_000) });

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(second.cacheHit.hit).toBe(true);
        expect(second.rawPayload).toEqual(first.rawPayload);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not fetch SCM when live SCM is disabled", async () => {
        mockDb.config.liveScmEnabled = false;
        const fetchImpl = vi.fn(async () => jsonResponse({ success: true, lowest_price: "$1.00" }));

        const result = await fetchScmPriceOverview("Disabled Item", { fetchImpl, queue: immediateQueue, now: NOW });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("LIVE_SCM_DISABLED");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("does not fetch SCM while the circuit breaker is active", async () => {
        mockDb.config.circuitBreakerUntil = new Date(NOW.getTime() + 60_000);
        const fetchImpl = vi.fn(async () => jsonResponse({ success: true, lowest_price: "$1.00" }));

        const result = await fetchScmPriceOverview("Circuit Item", { fetchImpl, queue: immediateQueue, now: NOW });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("CIRCUIT_BREAKER_OPEN");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        [429, "HTTP_429"],
        [403, "HTTP_403"],
        [503, "HTTP_5XX"],
    ] as const)("signals SCM HTTP %s failures", async (status, reason) => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: "failed" }, status));

        const result = await fetchScmPriceOverview("HTTP Failure", {
            fetchImpl,
            queue: immediateQueue,
            now: NOW,
            skipCache: true,
        });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe(reason);
        expect(result.failure?.status).toBe(status);
        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalled();
    });

    it("signals malformed JSON from SCM", async () => {
        const fetchImpl = vi.fn(async () => textResponse("not-json"));

        const result = await fetchScmPriceOverview("Malformed Json", { fetchImpl, queue: immediateQueue, now: NOW });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("MALFORMED_JSON");
        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalled();
    });

    it("signals timeout-style SCM failures", async () => {
        const timeoutError = Object.assign(new Error("request timeout"), { name: "AbortError" });
        const fetchImpl = vi.fn(async () => {
            throw timeoutError;
        });

        const result = await fetchScmPriceOverview("Timeout Item", { fetchImpl, queue: immediateQueue, now: NOW });

        expect(result.ok).toBe(false);
        expect(result.failure?.reason).toBe("TIMEOUT");
        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalled();
    });
});

describe("fetchCsfloatPriceList", () => {
    it("normalizes CSFloat price-list fixtures and retains the raw full index", async () => {
        const payload = [
            { market_hash_name: "AK-47 | Redline (Field-Tested)", quantity: 506, min_price: 12600 },
            { market_hash_name: "Rare Zero", quantity: 0, min_price: 0 },
        ];
        const fetchImpl = vi.fn(async () => jsonResponse(payload));

        const result = await fetchCsfloatPriceList({ fetchImpl, now: NOW });

        expect(result.ok).toBe(true);
        expect(result.source).toBe("csfloat");
        expect(result.rawPayload).toEqual(payload);
        expect(result.normalized?.entries).toEqual([
            { marketHashName: "AK-47 | Redline (Field-Tested)", quantity: 506, minPriceCents: 12600 },
            { marketHashName: "Rare Zero", quantity: 0, minPriceCents: 0 },
        ]);
        expect(Number.isInteger(result.normalized?.entries[0].minPriceCents)).toBe(true);

        const row = mockDb.cacheRows.get(cacheKey("csfloat", "price-list", "full-index"));
        expect(row?.rawPayload).toEqual(payload);
        expect(row?.normalizedPayload).toEqual(result.normalized);
    });

    it("uses CSFloat full-index cache inside TTL and avoids fetch", async () => {
        const payload = [{ market_hash_name: "Cached CSFloat", quantity: 3, min_price: 999 }];
        const fetchImpl = vi.fn(async () => jsonResponse(payload));

        const first = await fetchCsfloatPriceList({ fetchImpl, now: NOW });
        const second = await fetchCsfloatPriceList({ fetchImpl, now: new Date(NOW.getTime() + 5 * 60_000) });

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(second.cacheHit.hit).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("returns an individual CSFloat normalized entry from the cached full index", async () => {
        const fetchImpl = vi.fn(async () => jsonResponse([
            { market_hash_name: "Target Item", quantity: 8, min_price: 4321 },
        ]));

        const result = await fetchCsfloatPriceListEntry("Target Item", { fetchImpl, now: NOW });

        expect(result.ok).toBe(true);
        expect(result.normalized).toEqual({ marketHashName: "Target Item", quantity: 8, minPriceCents: 4321 });
    });

    it("signals malformed CSFloat JSON and malformed payloads", async () => {
        const malformedJson = await fetchCsfloatPriceList({ fetchImpl: vi.fn(async () => textResponse("not-json")), now: NOW });
        const malformedPayload = await fetchCsfloatPriceList({ fetchImpl: vi.fn(async () => jsonResponse({ data: [] })), now: NOW, skipCache: true });

        expect(malformedJson.ok).toBe(false);
        expect(malformedJson.failure?.reason).toBe("MALFORMED_JSON");
        expect(malformedPayload.ok).toBe(false);
        expect(malformedPayload.failure?.reason).toBe("MALFORMED_PAYLOAD");
    });
});
