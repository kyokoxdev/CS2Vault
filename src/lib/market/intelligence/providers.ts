import { ApiRequestQueue, csfloatQueue } from "@/lib/api-queue";
import { prisma } from "@/lib/db";
import { parseSteamPrice } from "@/lib/market/steam";
import { readProviderCache, writeProviderCache, type ProviderJsonObject, type ProviderJsonValue } from "@/lib/market/intelligence/cache";

const SCM_PRICE_OVERVIEW_URL = "https://steamcommunity.com/market/priceoverview/";
const CSFLOAT_PRICE_LIST_URL = "https://csfloat.com/api/v1/listings/price-list";
const CS2_APP_ID = "730";
const USD_CURRENCY_ID = "1";
const SCM_CACHE_TTL_MS = 5 * 60 * 1000;
const CSFLOAT_PRICE_LIST_CACHE_TTL_MS = 20 * 60 * 1000;
const SCM_TIMEOUT_MS = 15_000;
const CSFLOAT_TIMEOUT_MS = 15_000;
const SCM_MIN_DELAY_MS = 5_000;
const SCM_MAX_DELAY_MS = 10_000;
const SCM_MAX_DAILY_REQUESTS = 950;

const STANDARD_BROWSER_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
];

export const intelligenceScmQueue = new ApiRequestQueue({
    queueName: "intelligence-scm",
    useGlobalRateLimit: true,
    minDelayMs: randomScmDelayMs(),
    maxRetries: 0,
    maxDailyRequests: SCM_MAX_DAILY_REQUESTS,
});

export type IntelligenceProviderSource = "scm" | "csfloat";
export type ProviderFailureReason =
    | "LIVE_SCM_DISABLED"
    | "CIRCUIT_BREAKER_OPEN"
    | "HTTP_429"
    | "HTTP_403"
    | "HTTP_5XX"
    | "HTTP_ERROR"
    | "TIMEOUT"
    | "MALFORMED_JSON"
    | "MALFORMED_PAYLOAD"
    | "PROVIDER_UNSUCCESSFUL";

export interface ProviderCacheMetadata {
    hit: boolean;
    fetchedAt?: Date;
    expiresAt?: Date | null;
}

export interface ProviderFailureSignal {
    provider: IntelligenceProviderSource;
    reason: ProviderFailureReason;
    status?: number;
    message: string;
    circuitBreakerOpen: boolean;
}

export interface ScmNormalizedPayload extends ProviderJsonObject {
    marketHashName: string;
    lowestPriceCents: number | null;
    medianPriceCents: number | null;
    volume: number | null;
}

export interface CsfloatPriceListEntry extends ProviderJsonObject {
    marketHashName: string;
    quantity: number;
    minPriceCents: number;
}

export interface CsfloatPriceListNormalizedPayload extends ProviderJsonObject {
    entries: CsfloatPriceListEntry[];
}

export interface IntelligenceProviderResult<TNormalized extends ProviderJsonValue> {
    ok: boolean;
    source: IntelligenceProviderSource;
    rawPayload?: ProviderJsonValue;
    normalized?: TNormalized;
    cacheHit: ProviderCacheMetadata;
    failure?: ProviderFailureSignal;
}

interface ProviderRequestQueue {
    enqueue<T>(execute: () => Promise<T>, priority?: number): Promise<T>;
}

type ProviderFetch = (input: string, init?: RequestInit) => Promise<ResponseLike>;

interface ProviderFetchOptions {
    fetchImpl?: ProviderFetch;
    queue?: ProviderRequestQueue;
    now?: Date;
    skipCache?: boolean;
    timeoutMs?: number;
}

interface ScmConfigState {
    liveScmEnabled: boolean;
    circuitBreakerUntil: Date | null;
}

interface ResponseLike {
    ok: boolean;
    status: number;
    statusText?: string;
    json(): Promise<unknown>;
}

interface FetchErrorWithName {
    name?: string;
    message?: string;
}

function randomScmDelayMs(): number {
    return SCM_MIN_DELAY_MS + Math.floor(Math.random() * (SCM_MAX_DELAY_MS - SCM_MIN_DELAY_MS + 1));
}

function pickBrowserUserAgent(): string {
    const index = Math.floor(Math.random() * STANDARD_BROWSER_USER_AGENTS.length);
    return STANDARD_BROWSER_USER_AGENTS[index];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortLikeError(error: unknown): boolean {
    if (!isRecord(error)) return false;
    const candidate = error as FetchErrorWithName;
    return candidate.name === "AbortError" || candidate.message?.toLowerCase().includes("timeout") === true;
}

function statusToFailureReason(status: number): ProviderFailureReason {
    if (status === 429) return "HTTP_429";
    if (status === 403) return "HTTP_403";
    if (status >= 500) return "HTTP_5XX";
    return "HTTP_ERROR";
}

function boundedTimeoutMs(requestedTimeoutMs: number | undefined, maxTimeoutMs: number): number {
    if (requestedTimeoutMs === undefined) return maxTimeoutMs;
    if (!Number.isFinite(requestedTimeoutMs)) return maxTimeoutMs;
    return Math.min(Math.max(Math.floor(requestedTimeoutMs), 1), maxTimeoutMs);
}

function providerFailure(
    provider: IntelligenceProviderSource,
    reason: ProviderFailureReason,
    message: string,
    circuitBreakerOpen: boolean,
    status?: number
): ProviderFailureSignal {
    return { provider, reason, status, message, circuitBreakerOpen };
}

function centsFromSteamPrice(value: unknown): number | null {
    if (typeof value !== "string" || value.trim().length === 0) return null;
    const parsed = parseSteamPrice(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
}

function volumeFromSteamValue(value: unknown): number | null {
    if (typeof value !== "string" || value.trim().length === 0) return null;
    const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseScmPriceOverview(marketHashName: string, payload: unknown): IntelligenceProviderResult<ScmNormalizedPayload> {
    if (!isRecord(payload)) {
        return {
            ok: false,
            source: "scm",
            rawPayload: {},
            cacheHit: { hit: false },
            failure: providerFailure("scm", "MALFORMED_PAYLOAD", "SCM response was not an object", true),
        };
    }

    const rawPayload = payload as ProviderJsonObject;
    if (payload.success !== true) {
        return {
            ok: false,
            source: "scm",
            rawPayload,
            cacheHit: { hit: false },
            failure: providerFailure("scm", "PROVIDER_UNSUCCESSFUL", "SCM returned success:false", true),
        };
    }

    const lowestPriceCents = centsFromSteamPrice(payload.lowest_price);
    const medianPriceCents = centsFromSteamPrice(payload.median_price);

    if (lowestPriceCents === null && medianPriceCents === null) {
        return {
            ok: false,
            source: "scm",
            rawPayload,
            cacheHit: { hit: false },
            failure: providerFailure("scm", "MALFORMED_PAYLOAD", "SCM response did not include a parseable price", true),
        };
    }

    return {
        ok: true,
        source: "scm",
        rawPayload,
        normalized: {
            marketHashName,
            lowestPriceCents,
            medianPriceCents,
            volume: volumeFromSteamValue(payload.volume),
        },
        cacheHit: { hit: false },
    };
}

function normalizeCsfloatPriceList(payload: unknown): IntelligenceProviderResult<CsfloatPriceListNormalizedPayload> {
    if (!Array.isArray(payload)) {
        return {
            ok: false,
            source: "csfloat",
            rawPayload: {},
            cacheHit: { hit: false },
            failure: providerFailure("csfloat", "MALFORMED_PAYLOAD", "CSFloat price-list response was not an array", false),
        };
    }

    const entries: CsfloatPriceListEntry[] = [];
    for (const item of payload) {
        if (!isRecord(item)) continue;
        if (typeof item.market_hash_name !== "string") continue;
        const quantity = item.quantity;
        const minPrice = item.min_price;
        if (typeof quantity !== "number" || typeof minPrice !== "number") continue;
        if (!Number.isInteger(quantity) || !Number.isInteger(minPrice)) continue;
        entries.push({
            marketHashName: item.market_hash_name,
            quantity,
            minPriceCents: minPrice,
        });
    }

    return {
        ok: true,
        source: "csfloat",
        rawPayload: payload as ProviderJsonValue,
        normalized: { entries },
        cacheHit: { hit: false },
    };
}

async function readScmConfig(): Promise<ScmConfigState> {
    const config = await prisma.intelligenceConfig.findUnique({ where: { id: "default" } });
    return {
        liveScmEnabled: config?.liveScmEnabled === true,
        circuitBreakerUntil: config?.circuitBreakerUntil ?? null,
    };
}

async function recordProviderFailure(reason: ProviderFailureReason, message: string, now: Date): Promise<void> {
    const circuitBreakerUntil = ["HTTP_429", "HTTP_403", "HTTP_5XX", "TIMEOUT", "MALFORMED_JSON", "PROVIDER_UNSUCCESSFUL"].includes(reason)
        ? new Date(now.getTime() + 30 * 60 * 1000)
        : null;

    await prisma.intelligenceConfig.upsert({
        where: { id: "default" },
        create: {
            id: "default",
            liveScmEnabled: false,
            circuitBreakerUntil,
            consecutiveProviderFailures: 1,
            lastError: message,
        },
        update: {
            circuitBreakerUntil,
            consecutiveProviderFailures: { increment: 1 },
            lastError: message,
        },
    });
}

export async function fetchScmPriceOverview(
    marketHashName: string,
    options: ProviderFetchOptions = {}
): Promise<IntelligenceProviderResult<ScmNormalizedPayload>> {
    const now = options.now ?? new Date();
    const cache = options.skipCache
        ? { hit: false as const }
        : await readProviderCache<ScmNormalizedPayload>({ provider: "scm", lookupType: "market_hash_name", lookupKey: marketHashName }, now);

    if (cache.hit && cache.entry) {
        return {
            ok: true,
            source: "scm",
            rawPayload: cache.entry.rawPayload,
            normalized: cache.entry.normalizedPayload,
            cacheHit: { hit: true, fetchedAt: cache.entry.fetchedAt, expiresAt: cache.entry.expiresAt },
        };
    }

    const config = await readScmConfig();
    if (!config.liveScmEnabled) {
        return {
            ok: false,
            source: "scm",
            cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
            failure: providerFailure("scm", "LIVE_SCM_DISABLED", "Live SCM requests are disabled by IntelligenceConfig", false),
        };
    }

    if (config.circuitBreakerUntil && config.circuitBreakerUntil.getTime() > now.getTime()) {
        return {
            ok: false,
            source: "scm",
            cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
            failure: providerFailure("scm", "CIRCUIT_BREAKER_OPEN", "SCM circuit breaker is active", true),
        };
    }

    const requestQueue = options.queue ?? intelligenceScmQueue;
    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = boundedTimeoutMs(options.timeoutMs, SCM_TIMEOUT_MS);
    const url = new URL(SCM_PRICE_OVERVIEW_URL);
    url.searchParams.set("appid", CS2_APP_ID);
    url.searchParams.set("currency", USD_CURRENCY_ID);
    url.searchParams.set("market_hash_name", marketHashName);

    try {
        const response = await requestQueue.enqueue<ResponseLike>(() => fetchImpl(url.toString(), {
            headers: { "User-Agent": pickBrowserUserAgent() },
            signal: AbortSignal.timeout(timeoutMs),
        }));

        if (!response.ok) {
            const reason = statusToFailureReason(response.status);
            const message = `SCM request failed with HTTP ${response.status}`;
            await recordProviderFailure(reason, message, now);
            return {
                ok: false,
                source: "scm",
                cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
                failure: providerFailure("scm", reason, message, reason !== "HTTP_ERROR", response.status),
            };
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            const message = "SCM response body was not valid JSON";
            await recordProviderFailure("MALFORMED_JSON", message, now);
            return {
                ok: false,
                source: "scm",
                cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
                failure: providerFailure("scm", "MALFORMED_JSON", message, true),
            };
        }

        const parsed = parseScmPriceOverview(marketHashName, payload);
        if (!parsed.ok || !parsed.normalized) {
            if (parsed.failure) {
                await recordProviderFailure(parsed.failure.reason, parsed.failure.message, now);
            }
            return parsed;
        }

        await writeProviderCache({
            provider: "scm",
            lookupType: "market_hash_name",
            lookupKey: marketHashName,
            rawPayload: parsed.rawPayload ?? {},
            normalizedPayload: parsed.normalized,
            ttlMs: SCM_CACHE_TTL_MS,
            fetchedAt: now,
        });

        return parsed;
    } catch (error) {
        const reason: ProviderFailureReason = isAbortLikeError(error) ? "TIMEOUT" : "HTTP_ERROR";
        const message = error instanceof Error ? error.message : "SCM request failed";
        await recordProviderFailure(reason, message, now);
        return {
            ok: false,
            source: "scm",
            cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
            failure: providerFailure("scm", reason, message, reason === "TIMEOUT"),
        };
    }
}

export async function fetchCsfloatPriceList(
    options: ProviderFetchOptions = {}
): Promise<IntelligenceProviderResult<CsfloatPriceListNormalizedPayload>> {
    const now = options.now ?? new Date();
    const cache = options.skipCache
        ? { hit: false as const }
        : await readProviderCache<CsfloatPriceListNormalizedPayload>({ provider: "csfloat", lookupType: "price-list", lookupKey: "full-index" }, now);

    if (cache.hit && cache.entry) {
        return {
            ok: true,
            source: "csfloat",
            rawPayload: cache.entry.rawPayload,
            normalized: cache.entry.normalizedPayload,
            cacheHit: { hit: true, fetchedAt: cache.entry.fetchedAt, expiresAt: cache.entry.expiresAt },
        };
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = boundedTimeoutMs(options.timeoutMs, CSFLOAT_TIMEOUT_MS);
    try {
        const requestQueue = options.queue ?? csfloatQueue;
        const response = await requestQueue.enqueue<ResponseLike>(() => fetchImpl(CSFLOAT_PRICE_LIST_URL, {
            signal: AbortSignal.timeout(timeoutMs),
        }));

        if (!response.ok) {
            const reason = statusToFailureReason(response.status);
            const message = `CSFloat price-list request failed with HTTP ${response.status}`;
            return {
                ok: false,
                source: "csfloat",
                cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
                failure: providerFailure("csfloat", reason, message, reason !== "HTTP_ERROR", response.status),
            };
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            return {
                ok: false,
                source: "csfloat",
                cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
                failure: providerFailure("csfloat", "MALFORMED_JSON", "CSFloat price-list response body was not valid JSON", false),
            };
        }

        const normalized = normalizeCsfloatPriceList(payload);
        if (!normalized.ok || !normalized.normalized) return normalized;

        await writeProviderCache({
            provider: "csfloat",
            lookupType: "price-list",
            lookupKey: "full-index",
            rawPayload: normalized.rawPayload ?? [],
            normalizedPayload: normalized.normalized,
            ttlMs: CSFLOAT_PRICE_LIST_CACHE_TTL_MS,
            fetchedAt: now,
        });

        return normalized;
    } catch (error) {
        const reason: ProviderFailureReason = isAbortLikeError(error) ? "TIMEOUT" : "HTTP_ERROR";
        const message = error instanceof Error ? error.message : "CSFloat price-list request failed";
        return {
            ok: false,
            source: "csfloat",
            cacheHit: { hit: false, fetchedAt: cache.fetchedAt, expiresAt: cache.expiresAt },
            failure: providerFailure("csfloat", reason, message, reason === "TIMEOUT"),
        };
    }
}

export async function fetchCsfloatPriceListEntry(
    marketHashName: string,
    options: ProviderFetchOptions = {}
): Promise<IntelligenceProviderResult<CsfloatPriceListEntry>> {
    const result = await fetchCsfloatPriceList(options);
    if (!result.ok || !result.normalized) {
        return {
            ok: false,
            source: "csfloat",
            rawPayload: result.rawPayload,
            cacheHit: result.cacheHit,
            failure: result.failure,
        };
    }

    const entry = result.normalized.entries.find((candidate) => candidate.marketHashName === marketHashName);
    if (!entry) {
        return {
            ok: false,
            source: "csfloat",
            rawPayload: result.rawPayload,
            cacheHit: result.cacheHit,
            failure: providerFailure("csfloat", "MALFORMED_PAYLOAD", `CSFloat price-list did not include ${marketHashName}`, false),
        };
    }

    return {
        ok: true,
        source: "csfloat",
        rawPayload: result.rawPayload,
        normalized: entry,
        cacheHit: result.cacheHit,
    };
}
