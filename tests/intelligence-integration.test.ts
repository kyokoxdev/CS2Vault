import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => {
    interface ItemRow {
        id: string;
        marketHashName: string;
        name: string;
        category: string;
        type: string | null;
        isWatched: boolean;
        isActive: boolean;
    }

    interface QueueRow {
        id: string;
        itemId: string;
        nextRunAt: Date;
        priority: number;
        tier: string;
        attempts: number;
        lastError: string | null;
        lockedUntil: Date | null;
        lastFetchedAt: Date | null;
        disabledReason: string | null;
        status: string;
    }

    interface ConfigRow {
        id: string;
        liveScmEnabled: boolean;
        circuitBreakerUntil: Date | null;
        consecutiveProviderFailures: number;
        requestBudget: unknown;
        lastRunAt: Date | null;
        lastError: string | null;
    }

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

    const items: ItemRow[] = [];
    const queueRows: QueueRow[] = [];
    const observations: ObservationRow[] = [];
    const snapshots: SnapshotRow[] = [];
    const signals: SignalRow[] = [];
    const events: EventRow[] = [];
    const caches: unknown[] = [];
    const config: ConfigRow = {
        id: "default",
        liveScmEnabled: true,
        circuitBreakerUntil: null,
        consecutiveProviderFailures: 0,
        requestBudget: {},
        lastRunAt: null,
        lastError: null,
    };

    function dateMatches(value: Date, filter?: { gte?: Date; lt?: Date }): boolean {
        if (!filter) return true;
        if (filter.gte && value.getTime() < filter.gte.getTime()) return false;
        if (filter.lt && value.getTime() >= filter.lt.getTime()) return false;
        return true;
    }

    function queueRecord(row: QueueRow) {
        const item = items.find((candidate) => candidate.id === row.itemId);
        return {
            id: row.id,
            itemId: row.itemId,
            nextRunAt: row.nextRunAt,
            priority: row.priority,
            tier: row.tier,
            attempts: row.attempts,
            lastError: row.lastError,
            lockedUntil: row.lockedUntil,
            lastFetchedAt: row.lastFetchedAt,
            disabledReason: row.disabledReason,
            status: row.status,
            item: { marketHashName: item?.marketHashName ?? "" },
        };
    }

    function statusIn(rowStatus: string, statusFilter: unknown): boolean {
        if (typeof statusFilter === "string") return rowStatus === statusFilter;
        if (typeof statusFilter !== "object" || statusFilter === null || !("in" in statusFilter)) return true;
        return (statusFilter as { in: string[] }).in.includes(rowStatus);
    }

    function tierAllowed(rowTier: string, tierFilter: unknown): boolean {
        if (typeof tierFilter !== "object" || tierFilter === null) return true;
        if ("notIn" in tierFilter) return !(tierFilter as { notIn: string[] }).notIn.includes(rowTier);
        if ("in" in tierFilter) return (tierFilter as { in: string[] }).in.includes(rowTier);
        return true;
    }

    function applyQueueData(row: QueueRow, data: Record<string, unknown>): QueueRow {
        if (typeof data.status === "string") row.status = data.status;
        if (typeof data.priority === "number") row.priority = data.priority;
        if (typeof data.tier === "string") row.tier = data.tier;
        if (typeof data.lastError === "string" || data.lastError === null) row.lastError = data.lastError;
        if (data.lockedUntil instanceof Date || data.lockedUntil === null) row.lockedUntil = data.lockedUntil;
        if (data.lastFetchedAt instanceof Date || data.lastFetchedAt === null) row.lastFetchedAt = data.lastFetchedAt;
        if (data.nextRunAt instanceof Date) row.nextRunAt = data.nextRunAt;
        if (typeof data.disabledReason === "string" || data.disabledReason === null) row.disabledReason = data.disabledReason;
        if (typeof data.attempts === "number") row.attempts = data.attempts;
        if (typeof data.attempts === "object" && data.attempts !== null && "increment" in data.attempts) {
            row.attempts += (data.attempts as { increment: number }).increment;
        }
        return row;
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

    function reset(): void {
        items.length = 0;
        queueRows.length = 0;
        observations.length = 0;
        snapshots.length = 0;
        signals.length = 0;
        events.length = 0;
        caches.length = 0;
        config.liveScmEnabled = true;
        config.circuitBreakerUntil = null;
        config.consecutiveProviderFailures = 0;
        config.requestBudget = {};
        config.lastRunAt = null;
        config.lastError = null;
    }

    return {
        items,
        queueRows,
        observations,
        snapshots,
        signals,
        events,
        caches,
        config,
        reset,
        item: {
            upsert: vi.fn(async ({ where, create, update }: { where: { marketHashName: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
                const existing = items.find((item) => item.marketHashName === where.marketHashName);
                if (existing) {
                    if (typeof update.name === "string") existing.name = update.name;
                    if (typeof update.category === "string") existing.category = update.category;
                    if (typeof update.type === "string" || update.type === null) existing.type = update.type;
                    if (typeof update.isActive === "boolean") existing.isActive = update.isActive;
                    return existing;
                }
                const row: ItemRow = {
                    id: `item-${items.length + 1}`,
                    marketHashName: String(create.marketHashName),
                    name: String(create.name),
                    category: String(create.category),
                    type: typeof create.type === "string" ? create.type : null,
                    isWatched: create.isWatched === true,
                    isActive: create.isActive !== false,
                };
                items.push(row);
                return row;
            }),
        },
        intelligenceQueueItem: {
            upsert: vi.fn(async ({ where, create, update }: { where: { itemId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
                const existing = queueRows.find((row) => row.itemId === where.itemId);
                if (existing) return applyQueueData(existing, update);
                const row: QueueRow = {
                    id: `queue-${queueRows.length + 1}`,
                    itemId: String(create.itemId),
                    nextRunAt: create.nextRunAt instanceof Date ? create.nextRunAt : new Date(0),
                    priority: Number(create.priority),
                    tier: String(create.tier),
                    attempts: Number(create.attempts),
                    lastError: typeof create.lastError === "string" ? create.lastError : null,
                    lockedUntil: create.lockedUntil instanceof Date ? create.lockedUntil : null,
                    lastFetchedAt: create.lastFetchedAt instanceof Date ? create.lastFetchedAt : null,
                    disabledReason: typeof create.disabledReason === "string" ? create.disabledReason : null,
                    status: String(create.status),
                };
                queueRows.push(row);
                return row;
            }),
            findMany: vi.fn(async ({ where, take, select }: { where: Record<string, unknown>; take?: number; select?: Record<string, boolean> }) => {
                let rows = [...queueRows];
                if (where.status !== undefined) rows = rows.filter((row) => statusIn(row.status, where.status));
                if (where.tier !== undefined) rows = rows.filter((row) => tierAllowed(row.tier, where.tier) || row.tier === where.tier);
                if (where.itemId && typeof where.itemId === "object" && "in" in where.itemId) {
                    const ids = (where.itemId as { in: string[] }).in;
                    rows = rows.filter((row) => ids.includes(row.itemId));
                }
                if (where.nextRunAt && typeof where.nextRunAt === "object" && "lte" in where.nextRunAt) {
                    const dueAt = (where.nextRunAt as { lte: Date }).lte;
                    rows = rows.filter((row) => row.nextRunAt.getTime() <= dueAt.getTime() && (!row.lockedUntil || row.lockedUntil.getTime() < dueAt.getTime()));
                }
                rows.sort((a, b) => b.priority - a.priority || a.nextRunAt.getTime() - b.nextRunAt.getTime());
                const limited = typeof take === "number" ? rows.slice(0, take) : rows;
                if (select?.itemId && select?.tier && Object.keys(select).length === 2) return limited.map((row) => ({ itemId: row.itemId, tier: row.tier }));
                if (select?.itemId && Object.keys(select).length === 1) return limited.map((row) => ({ itemId: row.itemId }));
                return limited.map(queueRecord);
            }),
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                const row = queueRows.find((candidate) => candidate.id === where.id);
                return row ? queueRecord(row) : null;
            }),
            findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
                const dueBefore = where.nextRunAt && typeof where.nextRunAt === "object" && "lte" in where.nextRunAt
                    ? (where.nextRunAt as { lte: Date }).lte
                    : new Date("9999-01-01T00:00:00.000Z");
                const row = queueRows
                    .filter((candidate) => statusIn(candidate.status, where.status))
                    .filter((candidate) => candidate.nextRunAt.getTime() <= dueBefore.getTime())
                    .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())[0];
                return row ? { nextRunAt: row.nextRunAt } : null;
            }),
            count: vi.fn(async ({ where }: { where: { status: string } }) => queueRows.filter((row) => row.status === where.status).length),
            updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const matched = queueRows.filter((row) => {
                    if (typeof where.id === "string" && row.id !== where.id) return false;
                    if (where.status !== undefined && !statusIn(row.status, where.status)) return false;
                    if (where.tier !== undefined && !tierAllowed(row.tier, where.tier)) return false;
                    if (where.nextRunAt && row.nextRunAt.getTime() > (where.nextRunAt as { lte: Date }).lte.getTime()) return false;
                    if (Array.isArray(where.OR)) {
                        const now = where.nextRunAt ? (where.nextRunAt as { lte: Date }).lte : new Date();
                        if (row.lockedUntil && row.lockedUntil.getTime() >= now.getTime()) return false;
                    }
                    return true;
                });
                matched.forEach((row) => applyQueueData(row, data));
                return { count: matched.length };
            }),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const row = queueRows.find((candidate) => candidate.id === where.id);
                if (!row) throw new Error(`Missing queue row ${where.id}`);
                return queueRecord(applyQueueData(row, data));
            }),
        },
        intelligenceConfig: {
            findUnique: vi.fn(async () => ({ ...config })),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                if (typeof data.liveScmEnabled === "boolean") config.liveScmEnabled = data.liveScmEnabled;
                if (data.circuitBreakerUntil instanceof Date || data.circuitBreakerUntil === null) config.circuitBreakerUntil = data.circuitBreakerUntil;
                if (typeof data.consecutiveProviderFailures === "number") config.consecutiveProviderFailures = data.consecutiveProviderFailures;
                if (data.requestBudget !== undefined) config.requestBudget = data.requestBudget;
                if (data.lastRunAt instanceof Date || data.lastRunAt === null) config.lastRunAt = data.lastRunAt;
                if (typeof data.lastError === "string" || data.lastError === null) config.lastError = data.lastError;
                return { ...config };
            }),
        },
        intelligenceProviderCache: {
            upsert: vi.fn(async (args: unknown) => {
                caches.push(args);
                return args;
            }),
            findFirst: vi.fn(async () => ({
                normalizedPayload: {
                    entries: [
                        { marketHashName: "Task 10 Accumulation Fixture", quantity: 80, minPriceCents: 10_100 },
                    ],
                },
            })),
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
            findMany: vi.fn(async ({ where, orderBy }: { where: { itemId: string | { in: string[] }; status: string }; orderBy?: Record<string, string> | Array<Record<string, string>> }) => {
                const itemIds = typeof where.itemId === "string" ? [where.itemId] : where.itemId.in;
                const rows = observations.filter((row) => itemIds.includes(row.itemId) && row.status === where.status);
                const orderEntries = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
                if (orderEntries.some((order) => order.observedAt === "desc")) {
                    return rows.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || b.id - a.id);
                }
                return rows.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
            }),
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
            findMany: vi.fn(async () => []),
        },
        intelligenceSignal: {
            findFirst: vi.fn(async ({ where }: { where: { itemId: string; status: string } }) => signals
                .filter((row) => row.itemId === where.itemId && row.status === where.status)
                .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0] ?? null),
            findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
                let rows = signals.filter((row) => row.status === "active");
                if (typeof where.signalType === "string") rows = rows.filter((row) => row.signalType === where.signalType);
                if (where.itemId && typeof where.itemId === "object" && "in" in where.itemId) {
                    const ids = (where.itemId as { in: string[] }).in;
                    rows = rows.filter((row) => ids.includes(row.itemId));
                }
                rows.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime() || b.id.localeCompare(a.id));
                return rows.slice(0, take).map((row) => ({
                    ...row,
                    item: items.find((item) => item.id === row.itemId) ?? null,
                }));
            }),
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
                && JSON.stringify(row.metadata) === JSON.stringify(where.metadata.equals)) ?? null),
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
        item: mockDb.item,
        intelligenceQueueItem: mockDb.intelligenceQueueItem,
        intelligenceConfig: mockDb.intelligenceConfig,
        intelligenceProviderCache: mockDb.intelligenceProviderCache,
        intelligenceObservation: mockDb.intelligenceObservation,
        priceSnapshot: mockDb.priceSnapshot,
        candlestick: mockDb.candlestick,
        intelligenceSignal: mockDb.intelligenceSignal,
        intelligenceSignalEvent: mockDb.intelligenceSignalEvent,
    },
}));

vi.mock("@/lib/market/intelligence/providers", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/market/intelligence/providers")>();
    return {
        ...actual,
        fetchCsfloatPriceList: vi.fn(),
        fetchCsfloatPriceListEntry: vi.fn(),
        fetchScmPriceOverview: vi.fn(),
    };
});

import { seedIntelligenceCatalog } from "@/lib/market/intelligence/catalog";
import { runIntelligenceQueue } from "@/lib/market/intelligence/runner";
import {
    fetchCsfloatPriceList,
    fetchCsfloatPriceListEntry,
    fetchScmPriceOverview,
    type CsfloatPriceListEntry,
    type CsfloatPriceListNormalizedPayload,
    type IntelligenceProviderResult,
    type ScmNormalizedPayload,
} from "@/lib/market/intelligence/providers";

import { GET as getSignals } from "@/app/api/intelligence/signals/route";
import { GET as getRun } from "@/app/api/intelligence/run/route";

const SEED_AT = new Date("2026-05-15T12:00:00.000Z");
const RUN_AT = new Date(SEED_AT.getTime() + 31 * 60 * 1000);
const FIXTURE_NAME = "Task 10 Accumulation Fixture";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

function priceListResult(entries: Array<{ marketHashName: string; quantity: number; minPriceCents: number }>): IntelligenceProviderResult<CsfloatPriceListNormalizedPayload> {
    return {
        ok: true,
        source: "csfloat",
        cacheHit: { hit: true, fetchedAt: SEED_AT, expiresAt: new Date(SEED_AT.getTime() + 20 * 60 * 1000) },
        normalized: { entries },
    };
}

function scmResult(): IntelligenceProviderResult<ScmNormalizedPayload> {
    return {
        ok: true,
        source: "scm",
        rawPayload: { success: true, lowest_price: "$101.00", median_price: "$101.00", volume: "330" },
        normalized: {
            marketHashName: FIXTURE_NAME,
            lowestPriceCents: 10_100,
            medianPriceCents: 10_100,
            volume: 330,
        },
        cacheHit: { hit: false, fetchedAt: RUN_AT },
    };
}

function csfloatEntryResult(): IntelligenceProviderResult<CsfloatPriceListEntry> {
    return {
        ok: true,
        source: "csfloat",
        cacheHit: { hit: true, fetchedAt: SEED_AT, expiresAt: new Date(SEED_AT.getTime() + 20 * 60 * 1000) },
        normalized: { marketHashName: FIXTURE_NAME, quantity: 80, minPriceCents: 10_100 },
    };
}

function addHistoricalObservations(itemId: string): void {
    Array.from({ length: 12 }, (_, index) => {
        mockDb.observations.push({
            id: mockDb.observations.length + 1,
            itemId,
            provider: "scm",
            observedAt: new Date(RUN_AT.getTime() - (30 - index * 2.5) * 60 * 60 * 1000),
            floorPriceCents: 10_000,
            medianPriceCents: 10_000,
            listingCount: null,
            volume: 100,
            confidence: 0,
            freshness: "fresh",
            status: "observed",
            reasons: [],
            rawPayload: {},
        });
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.reset();
    process.env.CRON_SECRET = "test-secret";
});

describe("intelligence fixture pipeline", () => {
    it("seeds a catalog fixture, processes SCM data, and exposes the persisted signal through the API", async () => {
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult([
            { marketHashName: FIXTURE_NAME, quantity: 80, minPriceCents: 10_100 },
        ]));
        vi.mocked(fetchScmPriceOverview).mockResolvedValue(scmResult());
        vi.mocked(fetchCsfloatPriceListEntry).mockResolvedValue(csfloatEntryResult());

        const seed = await seedIntelligenceCatalog({ now: SEED_AT, random: () => 0 });
        const fixtureItem = mockDb.items.find((item) => item.marketHashName === FIXTURE_NAME);
        if (!fixtureItem) throw new Error("Fixture item was not seeded");
        mockDb.queueRows[0].nextRunAt = new Date(RUN_AT.getTime() - 60_000);
        addHistoricalObservations(fixtureItem.id);

        const run = await runIntelligenceQueue({ now: RUN_AT, perRunCap: 5 });
        const response = await getSignals(toNextRequest(new Request("http://localhost/api/intelligence/signals?signalType=accumulation")));
        const payload = await response.json();

        expect(seed.seeded).toBe(1);
        expect(run.status).toBe("success");
        expect(run.processed).toBe(1);
        expect(run.skippedDueToBudget).toBe(0);
        expect(fetchScmPriceOverview).toHaveBeenCalledTimes(1);
        expect(fetchCsfloatPriceListEntry).toHaveBeenCalledWith(FIXTURE_NAME, { now: RUN_AT });
        expect(mockDb.signals).toHaveLength(1);
        expect(mockDb.observations.at(-1)?.listingCount).toBe(80);
        expect(mockDb.events).toHaveLength(1);
        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.items).toHaveLength(1);
        expect(payload.data.items[0]).toEqual(expect.objectContaining({
            marketHashName: FIXTURE_NAME,
            signalType: "accumulation",
            tier: "low_supply_discontinued",
            scmMedianCents: 10_100,
            scmVolume: 330,
            csfloatFloorCents: 10_100,
            csfloatSupply: 80,
        }));
        expect(payload.data.items[0].reasons.map((reason: { code: string }) => reason.code)).toEqual(expect.arrayContaining([
            "accumulation-volume-spike",
            "accumulation-price-stable",
        ]));
    });

    it("keeps repeated cron pings budget-safe when the SCM minute budget is exhausted", async () => {
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult([
            { marketHashName: FIXTURE_NAME, quantity: 80, minPriceCents: 10_100 },
        ]));
        vi.mocked(fetchScmPriceOverview).mockResolvedValue(scmResult());
        vi.mocked(fetchCsfloatPriceListEntry).mockResolvedValue(csfloatEntryResult());

        await seedIntelligenceCatalog({ now: SEED_AT, random: () => 0 });
        mockDb.queueRows[0].nextRunAt = new Date(Date.now() - 60_000);
        mockDb.config.requestBudget = {
            scmMinuteStartedAt: new Date().toISOString(),
            scmMinuteCount: 19,
            scmDayStartedAt: new Date().toISOString(),
            scmDayCount: 100,
        };

        const request = () => toNextRequest(new Request("http://localhost/api/intelligence/run", {
            headers: { "x-cron-secret": "test-secret" },
        }));
        const responses = await Promise.all([getRun(request()), getRun(request()), getRun(request())]);
        const payloads = await Promise.all(responses.map((response) => response.json()));

        expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
        expect(payloads.map((payload) => payload.data.skippedDueToBudget)).toEqual([1, 1, 1]);
        expect(payloads.every((payload) => payload.data.processed === 0)).toBe(true);
        expect(fetchScmPriceOverview).not.toHaveBeenCalled();
        expect(mockDb.events).toHaveLength(0);
        expect(mockDb.queueRows[0].status).toBe("pending");
    });
});
