import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
    interface ObservationRow {
        id: number;
        itemId: string;
        provider: string;
        observedAt: Date;
        floorPriceCents: number | null;
        medianPriceCents: number | null;
        listingCount: number | null;
        volume: number | null;
        confidence: number;
        freshness: string;
        status: string;
        reasons: unknown;
        rawPayload: unknown;
    }

    interface SnapshotRow {
        id: number;
        itemId: string;
        price: number;
        volume: number | null;
        source: string;
        timestamp: Date;
    }

    interface CandleRow {
        itemId: string;
        interval: string;
        close: number;
        volume: number;
        timestamp: Date;
    }

    interface SignalRow {
        id: string;
        itemId: string;
        signalType: string;
        status: string;
        confidence: number;
        detectedAt: Date;
        lastSeenAt: Date;
        staleAt: Date | null;
        priceCents: number | null;
        baselineCents: number | null;
        deltaCents: number | null;
        reasons: unknown;
        metadata: unknown;
    }

    interface EventRow {
        id: number;
        signalId: string;
        itemId: string;
        eventType: string;
        signalType: string;
        occurredAt: Date;
        confidence: number;
        priceCents: number | null;
        baselineCents: number | null;
        deltaCents: number | null;
        reasons: unknown;
        metadata: unknown;
    }

    const observations: ObservationRow[] = [];
    const snapshots: SnapshotRow[] = [];
    const candles: CandleRow[] = [];
    const signals: SignalRow[] = [];
    const events: EventRow[] = [];
    const caches: unknown[] = [];

    function dateMatches(value: Date, filter?: { gte?: Date; lt?: Date }): boolean {
        if (!filter) return true;
        if (filter.gte && value.getTime() < filter.gte.getTime()) return false;
        if (filter.lt && value.getTime() >= filter.lt.getTime()) return false;
        return true;
    }

    function metadataEquals(left: unknown, right: unknown): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function updateSignal(row: SignalRow, data: Record<string, unknown>): SignalRow {
        if (typeof data.status === "string") row.status = data.status;
        if (typeof data.confidence === "number") row.confidence = data.confidence;
        if (data.detectedAt instanceof Date) row.detectedAt = data.detectedAt;
        if (data.lastSeenAt instanceof Date) row.lastSeenAt = data.lastSeenAt;
        if (data.staleAt instanceof Date || data.staleAt === null) row.staleAt = data.staleAt;
        if (typeof data.priceCents === "number" || data.priceCents === null) row.priceCents = data.priceCents;
        if (typeof data.baselineCents === "number" || data.baselineCents === null) row.baselineCents = data.baselineCents;
        if (typeof data.deltaCents === "number" || data.deltaCents === null) row.deltaCents = data.deltaCents;
        if (data.reasons !== undefined) row.reasons = data.reasons;
        if (data.metadata !== undefined) row.metadata = data.metadata;
        return row;
    }

    return {
        observations,
        snapshots,
        candles,
        signals,
        events,
        caches,
        intelligenceProviderCache: {
            upsert: vi.fn(async (args: unknown) => {
                caches.push(args);
                return {
                    provider: "scm",
                    lookupType: "market_hash_name",
                    lookupKey: "Test Item",
                    itemId: "item-1",
                    rawPayload: {},
                    normalizedPayload: {},
                    fetchedAt: new Date(),
                    expiresAt: null,
                };
            }),
        },
        intelligenceObservation: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                const row: ObservationRow = {
                    id: observations.length + 1,
                    itemId: String(data.itemId),
                    provider: String(data.provider),
                    observedAt: data.observedAt instanceof Date ? data.observedAt : new Date(),
                    floorPriceCents: typeof data.floorPriceCents === "number" ? data.floorPriceCents : null,
                    medianPriceCents: typeof data.medianPriceCents === "number" ? data.medianPriceCents : null,
                    listingCount: typeof data.listingCount === "number" ? data.listingCount : null,
                    volume: typeof data.volume === "number" ? data.volume : null,
                    confidence: typeof data.confidence === "number" ? data.confidence : 0,
                    freshness: String(data.freshness),
                    status: String(data.status),
                    reasons: data.reasons,
                    rawPayload: data.rawPayload,
                };
                observations.push(row);
                return row;
            }),
            update: vi.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
                const row = observations.find((candidate) => candidate.id === where.id);
                if (!row) throw new Error(`Missing observation ${where.id}`);
                if (typeof data.confidence === "number") row.confidence = data.confidence;
                if (typeof data.freshness === "string") row.freshness = data.freshness;
                if (data.reasons !== undefined) row.reasons = data.reasons;
                return row;
            }),
            findMany: vi.fn(async ({ where }: { where: { itemId: string; status: string } }) => observations
                .filter((row) => row.itemId === where.itemId && row.status === where.status)
                .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())),
        },
        priceSnapshot: {
            findFirst: vi.fn(async ({ where }: { where: { itemId: string; source?: string; timestamp?: { gte?: Date; lt?: Date } } }) => snapshots.find((row) => row.itemId === where.itemId
                && (where.source === undefined || row.source === where.source)
                && dateMatches(row.timestamp, where.timestamp)) ?? null),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                const row: SnapshotRow = {
                    id: snapshots.length + 1,
                    itemId: String(data.itemId),
                    price: Number(data.price),
                    volume: typeof data.volume === "number" ? data.volume : null,
                    source: String(data.source),
                    timestamp: data.timestamp instanceof Date ? data.timestamp : new Date(),
                };
                snapshots.push(row);
                return row;
            }),
            findMany: vi.fn(async ({ where }: { where: { itemId: string } }) => snapshots
                .filter((row) => row.itemId === where.itemId)
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())),
        },
        candlestick: {
            findMany: vi.fn(async ({ where }: { where: { itemId: string; interval: string } }) => candles
                .filter((row) => row.itemId === where.itemId && row.interval === where.interval)
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())),
        },
        intelligenceSignal: {
            findFirst: vi.fn(async ({ where }: { where: { itemId: string; status: string } }) => signals
                .filter((row) => row.itemId === where.itemId && row.status === where.status)
                .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0] ?? null),
            updateMany: vi.fn(async ({ where, data }: { where: { itemId: string; status: string; signalType?: { not: string } }; data: Record<string, unknown> }) => {
                const matched = signals.filter((row) => row.itemId === where.itemId
                    && row.status === where.status
                    && (where.signalType?.not === undefined || row.signalType !== where.signalType.not));
                matched.forEach((row) => updateSignal(row, data));
                return { count: matched.length };
            }),
            upsert: vi.fn(async ({ where, create, update }: { where: { itemId_signalType_status: { itemId: string; signalType: string; status: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
                const key = where.itemId_signalType_status;
                const existing = signals.find((row) => row.itemId === key.itemId && row.signalType === key.signalType && row.status === key.status);
                if (existing) return updateSignal(existing, update);
                const row = updateSignal({
                    id: `signal-${signals.length + 1}`,
                    itemId: String(create.itemId),
                    signalType: String(create.signalType),
                    status: String(create.status),
                    confidence: 0,
                    detectedAt: create.detectedAt instanceof Date ? create.detectedAt : new Date(),
                    lastSeenAt: create.lastSeenAt instanceof Date ? create.lastSeenAt : new Date(),
                    staleAt: null,
                    priceCents: null,
                    baselineCents: null,
                    deltaCents: null,
                    reasons: [],
                    metadata: {},
                }, create);
                signals.push(row);
                return row;
            }),
        },
        intelligenceSignalEvent: {
            findFirst: vi.fn(async ({ where }: { where: { signalId: string; itemId: string; signalType: string; metadata: { equals: unknown } } }) => events.find((row) => row.signalId === where.signalId
                && row.itemId === where.itemId
                && row.signalType === where.signalType
                && metadataEquals(row.metadata, where.metadata.equals)) ?? null),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                const row: EventRow = {
                    id: events.length + 1,
                    signalId: String(data.signalId),
                    itemId: String(data.itemId),
                    eventType: String(data.eventType),
                    signalType: String(data.signalType),
                    occurredAt: data.occurredAt instanceof Date ? data.occurredAt : new Date(),
                    confidence: Number(data.confidence),
                    priceCents: typeof data.priceCents === "number" ? data.priceCents : null,
                    baselineCents: typeof data.baselineCents === "number" ? data.baselineCents : null,
                    deltaCents: typeof data.deltaCents === "number" ? data.deltaCents : null,
                    reasons: data.reasons,
                    metadata: data.metadata,
                };
                events.push(row);
                return row;
            }),
        },
    };
});

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceProviderCache: mockDb.intelligenceProviderCache,
        intelligenceObservation: mockDb.intelligenceObservation,
        priceSnapshot: mockDb.priceSnapshot,
        candlestick: mockDb.candlestick,
        intelligenceSignal: mockDb.intelligenceSignal,
        intelligenceSignalEvent: mockDb.intelligenceSignalEvent,
    },
}));

import { prisma } from "@/lib/db";
import { processIntelligenceResult } from "@/lib/market/intelligence/processor";
import type { CsfloatPriceListEntry, IntelligenceProviderResult, ScmNormalizedPayload } from "@/lib/market/intelligence/providers";

const NOW = new Date("2026-05-15T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const ITEM_ID = "item-1";
const MARKET_HASH_NAME = "Test Item";

function observedAt(hoursAgo: number): Date {
    return new Date(NOW.getTime() - hoursAgo * HOUR_MS);
}

function addObservation(hoursAgo: number, priceCents: number, volume: number, itemId = ITEM_ID): void {
    mockDb.observations.push({
        id: mockDb.observations.length + 1,
        itemId,
        provider: "scm",
        observedAt: observedAt(hoursAgo),
        floorPriceCents: priceCents,
        medianPriceCents: priceCents,
        listingCount: null,
        volume,
        confidence: 0,
        freshness: "fresh",
        status: "observed",
        reasons: [],
        rawPayload: {},
    });
}

function addFlatObservationHistory(count: number, startHoursAgo: number, stepHours: number, priceCents = 10_000, volume = 100): void {
    Array.from({ length: count }, (_, index) => addObservation(startHoursAgo - index * stepHours, priceCents, volume));
}

function providerResult(priceCents: number, volume: number, fetchedAt = observedAt(1)): IntelligenceProviderResult<ScmNormalizedPayload> {
    return {
        ok: true,
        source: "scm",
        rawPayload: { lowest_price: `$${(priceCents / 100).toFixed(2)}`, volume: String(volume) },
        normalized: {
            marketHashName: MARKET_HASH_NAME,
            lowestPriceCents: priceCents,
            medianPriceCents: priceCents,
            volume,
        },
        cacheHit: { hit: false, fetchedAt },
    };
}

function csfloatResult(priceCents = 10_100, quantity = 80): IntelligenceProviderResult<CsfloatPriceListEntry> {
    return {
        ok: true,
        source: "csfloat",
        normalized: {
            marketHashName: MARKET_HASH_NAME,
            quantity,
            minPriceCents: priceCents,
        },
        cacheHit: { hit: true, fetchedAt: NOW },
    };
}

async function process(priceCents: number, volume: number, fetchedAt = observedAt(1)) {
    return processIntelligenceResult({
        itemId: ITEM_ID,
        marketHashName: MARKET_HASH_NAME,
        providerResult: providerResult(priceCents, volume, fetchedAt),
        csfloatResult: csfloatResult(priceCents, 80),
        now: NOW,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.observations.length = 0;
    mockDb.snapshots.length = 0;
    mockDb.candles.length = 0;
    mockDb.signals.length = 0;
    mockDb.events.length = 0;
    mockDb.caches.length = 0;
});

describe("processIntelligenceResult", () => {
    it("upserts latest signal and appends history event idempotently for repeated same observation", async () => {
        addFlatObservationHistory(12, 30, 2.5, 10_000, 100);

        const first = await process(10_100, 330, observedAt(1));
        const second = await process(10_100, 330, observedAt(1));

        expect(first.status).toBe("success");
        expect(first.scoring?.signalType).toBe("accumulation");
        expect(mockDb.observations.at(-2)?.listingCount).toBe(80);
        expect(second.status).toBe("success");
        expect(mockDb.signals.filter((signal) => signal.status === "active")).toHaveLength(1);
        expect(mockDb.signals[0]).toEqual(expect.objectContaining({ signalType: "accumulation" }));
        expect(mockDb.events).toHaveLength(1);
        expect(second.eventCreated).toBe(false);
        expect(prisma.intelligenceProviderCache.upsert).toHaveBeenCalledTimes(2);
    });

    it("dedupes steam-intelligence price snapshots within the same minute", async () => {
        addFlatObservationHistory(12, 30, 2.5, 10_000, 100);

        const first = await process(10_100, 330, new Date("2026-05-15T11:59:05.000Z"));
        const second = await process(10_100, 330, new Date("2026-05-15T11:59:45.000Z"));

        expect(first.snapshotCreated).toBe(true);
        expect(second.snapshotCreated).toBe(false);
        expect(mockDb.snapshots).toHaveLength(1);
        expect(mockDb.snapshots[0]).toEqual(expect.objectContaining({ source: "steam-intelligence", price: 101 }));
    });

    it("appends events for Accumulation to Pump to Dump transitions without deleting history", async () => {
        addFlatObservationHistory(12, 30, 2.5, 10_000, 100);
        const accumulation = await process(10_100, 330, observedAt(1));

        mockDb.observations.length = 0;
        Array.from({ length: 24 }, (_, index) => addObservation(180 - index * 7, 10_000, index < 18 ? 100 : 150));
        addObservation(3, 12_400, 230);
        addObservation(2, 12_500, 240);
        const pump = await process(12_600, 260, observedAt(1));

        mockDb.observations.length = 0;
        addFlatObservationHistory(10, 30, 2, 10_000, 100);
        addObservation(12, 12_200, 135);
        addObservation(11, 12_100, 130);
        addObservation(10, 12_000, 130);
        addObservation(2, 9_900, 125);
        const dump = await process(9_800, 120, observedAt(1));

        expect(accumulation.scoring?.signalType).toBe("accumulation");
        expect(pump.scoring?.signalType).toBe("pump");
        expect(dump.scoring?.signalType).toBe("dump");
        expect(mockDb.events.map((event) => event.signalType)).toEqual(["accumulation", "pump", "dump"]);
        expect(mockDb.events.map((event) => event.eventType)).toEqual(["detected", "transitioned", "transitioned"]);
        expect(mockDb.signals.filter((signal) => signal.status === "stale").map((signal) => signal.signalType)).toEqual(["accumulation", "pump"]);
    });

    it("persists stale and expired freshness reductions in observation and signal reasons", async () => {
        addFlatObservationHistory(12, 45, 2.5, 10_000, 100);
        const stale = await process(10_100, 330, observedAt(8));
        const staleObservation = mockDb.observations.at(-1);

        mockDb.observations.length = 0;
        mockDb.signals.length = 0;
        mockDb.events.length = 0;
        addFlatObservationHistory(12, 70, 2.5, 10_000, 100);
        const expired = await process(10_100, 330, observedAt(30));
        const expiredObservation = mockDb.observations.at(-1);

        expect(stale.scoring?.freshness).toBe("stale");
        expect(expired.scoring?.freshness).toBe("expired");
        expect(expired.scoring?.confidence).toBeLessThan(stale.scoring?.confidence ?? 0);
        expect((staleObservation?.reasons as Array<{ code: string }>).map((reason) => reason.code)).toContain("freshness-stale");
        expect((expiredObservation?.reasons as Array<{ code: string }>).map((reason) => reason.code)).toContain("freshness-expired");
        expect((mockDb.signals.at(-1)?.reasons as Array<{ code: string }>).map((reason) => reason.code)).toContain("freshness-expired");
    });

    it("falls back to PriceSnapshot and Candlestick history for pre-feature warm starts", async () => {
        Array.from({ length: 12 }, (_, index) => {
            mockDb.snapshots.push({
                id: index + 1,
                itemId: ITEM_ID,
                price: 100,
                volume: 100,
                source: "csfloat",
                timestamp: observedAt(30 - index * 2.5),
            });
        });

        const result = await process(10_100, 330, observedAt(1));

        expect(result.scoring?.signalType).toBe("accumulation");
        expect(result.scoring?.metrics.sampleCount).toBeGreaterThanOrEqual(13);
        expect(prisma.priceSnapshot.findMany).toHaveBeenCalled();
        expect(prisma.candlestick.findMany).toHaveBeenCalled();
    });
});
