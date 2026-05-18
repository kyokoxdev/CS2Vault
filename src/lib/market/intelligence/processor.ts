import { prisma } from "@/lib/db";
import { writeProviderCache, type ProviderInputJsonValue, type ProviderJsonObject, type ProviderJsonValue } from "@/lib/market/intelligence/cache";
import type { CsfloatPriceListEntry, IntelligenceProviderResult, ScmNormalizedPayload } from "@/lib/market/intelligence/providers";
import {
    scoreMarketIntelligence,
    type IntelligenceScoringObservation,
    type IntelligenceScoringResult,
    type IntelligenceSignalReason,
    type IntelligenceSignalType,
} from "@/lib/market/intelligence/scoring";

const INTELLIGENCE_SNAPSHOT_SOURCE = "steam-intelligence";
const HISTORY_LIMIT = 96;
const HIGH_CONFIDENCE_THRESHOLD = 75;

type ConfidenceBand = "low" | "medium" | "high";

export interface ProcessIntelligenceResultInput {
    itemId: string;
    marketHashName: string;
    providerResult: IntelligenceProviderResult<ScmNormalizedPayload>;
    csfloatResult?: IntelligenceProviderResult<CsfloatPriceListEntry>;
    now?: Date;
}

export interface ProcessIntelligenceResultOutput {
    status: "success" | "skipped" | "failed";
    reason?: string;
    observationId?: number;
    snapshotCreated: boolean;
    signalId?: string;
    eventCreated: boolean;
    scoring?: IntelligenceScoringResult;
}

interface ObservationRecord {
    id?: number;
    provider?: string;
    observedAt: Date;
    floorPriceCents: number | null;
    medianPriceCents: number | null;
    volume: number | null;
}

interface SnapshotRecord {
    timestamp: Date;
    price: number;
    volume: number | null;
    source?: string;
}

interface CandlestickRecord {
    timestamp: Date;
    close: number;
    volume: number;
}

interface SignalRecord {
    id: string;
    itemId: string;
    signalType: string;
    status: string;
    confidence: number;
    lastSeenAt: Date;
    metadata?: unknown;
}

interface SignalEventRecord {
    id: number;
}

function minuteStart(value: Date): Date {
    const date = new Date(value);
    date.setUTCSeconds(0, 0);
    return date;
}

function confidenceBand(confidence: number): ConfidenceBand {
    if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "high";
    if (confidence >= 50) return "medium";
    return "low";
}

function selectedPriceCents(payload: ScmNormalizedPayload): number | null {
    return payload.lowestPriceCents ?? payload.medianPriceCents ?? null;
}

function normalizeRawPayload(value: ProviderJsonValue | undefined): ProviderInputJsonValue {
    return value === undefined || value === null ? {} : value;
}

function serializeReasons(reasons: IntelligenceSignalReason[]): ProviderInputJsonValue {
    return reasons.map((reason) => {
        const serialized: ProviderJsonObject = {
            code: reason.code,
            label: reason.label,
        };
        if (reason.signalType) serialized.signalType = reason.signalType;
        return serialized;
    });
}

function serializeMetadata(metadata: Record<string, unknown>): ProviderJsonObject {
    const serialized: ProviderJsonObject = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
            serialized[key] = value;
        }
    }
    return serialized;
}

function observationToScoringObservation(record: ObservationRecord): IntelligenceScoringObservation | null {
    const priceCents = record.floorPriceCents ?? record.medianPriceCents;
    if (priceCents === null) return null;
    return {
        observedAt: record.observedAt,
        priceCents,
        volume: record.volume,
        source: record.provider ?? "intelligence-observation",
    };
}

function snapshotToScoringObservation(record: SnapshotRecord): IntelligenceScoringObservation {
    return {
        observedAt: record.timestamp,
        priceCents: Math.round(record.price * 100),
        volume: record.volume,
        source: record.source ?? "price-snapshot",
    };
}

function candleToScoringObservation(record: CandlestickRecord): IntelligenceScoringObservation {
    return {
        observedAt: record.timestamp,
        priceCents: Math.round(record.close * 100),
        volume: record.volume,
        source: "candlestick",
    };
}

function uniqueSortedHistory(observations: IntelligenceScoringObservation[]): IntelligenceScoringObservation[] {
    const byTime = new Map<number, IntelligenceScoringObservation>();
    for (const observation of observations) {
        byTime.set(observation.observedAt.getTime(), observation);
    }
    return [...byTime.values()].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
}

async function createObservation(
    input: ProcessIntelligenceResultInput,
    normalized: ScmNormalizedPayload,
    observedAt: Date
): Promise<ObservationRecord & { id: number }> {
    const record = await prisma.intelligenceObservation.create({
        data: {
            itemId: input.itemId,
            provider: input.providerResult.source,
            observedAt,
            floorPriceCents: normalized.lowestPriceCents,
            medianPriceCents: normalized.medianPriceCents,
            listingCount: input.csfloatResult?.ok ? input.csfloatResult.normalized?.quantity ?? null : null,
            volume: normalized.volume,
            confidence: 0,
            freshness: "fresh",
            status: "observed",
            reasons: [],
            rawPayload: normalizeRawPayload(input.providerResult.rawPayload),
        },
    });

    return record as ObservationRecord & { id: number };
}

async function createMinuteDedupedSnapshot(itemId: string, normalized: ScmNormalizedPayload, observedAt: Date): Promise<boolean> {
    const priceCents = selectedPriceCents(normalized);
    if (priceCents === null) return false;

    const start = minuteStart(observedAt);
    const end = new Date(start.getTime() + 60_000);
    const existing = await prisma.priceSnapshot.findFirst({
        where: {
            itemId,
            source: INTELLIGENCE_SNAPSHOT_SOURCE,
            timestamp: { gte: start, lt: end },
        },
        select: { id: true },
    });

    if (existing) return false;

    await prisma.priceSnapshot.create({
        data: {
            itemId,
            price: priceCents / 100,
            volume: normalized.volume,
            source: INTELLIGENCE_SNAPSHOT_SOURCE,
            timestamp: observedAt,
        },
    });
    return true;
}

async function persistProviderCache(input: ProcessIntelligenceResultInput, normalized: ScmNormalizedPayload, observedAt: Date): Promise<void> {
    await writeProviderCache({
        provider: input.providerResult.source,
        lookupType: "market_hash_name",
        lookupKey: input.marketHashName,
        itemId: input.itemId,
        rawPayload: normalizeRawPayload(input.providerResult.rawPayload),
        normalizedPayload: normalized,
        fetchedAt: observedAt,
    });
}

async function loadObservationHistory(itemId: string): Promise<IntelligenceScoringObservation[]> {
    const records = await prisma.intelligenceObservation.findMany({
        where: { itemId, status: "observed" },
        orderBy: { observedAt: "asc" },
        take: HISTORY_LIMIT,
    });

    return (records as ObservationRecord[])
        .map(observationToScoringObservation)
        .filter((observation): observation is IntelligenceScoringObservation => observation !== null);
}

async function loadWarmStartHistory(itemId: string): Promise<IntelligenceScoringObservation[]> {
    const [snapshots, candles] = await Promise.all([
        prisma.priceSnapshot.findMany({
            where: { itemId },
            orderBy: { timestamp: "asc" },
            take: HISTORY_LIMIT,
        }),
        prisma.candlestick.findMany({
            where: { itemId, interval: "1h" },
            orderBy: { timestamp: "asc" },
            take: HISTORY_LIMIT,
        }),
    ]);

    return uniqueSortedHistory([
        ...(snapshots as SnapshotRecord[]).map(snapshotToScoringObservation),
        ...(candles as CandlestickRecord[]).map(candleToScoringObservation),
    ]);
}

async function loadScoringHistory(itemId: string, current: ObservationRecord): Promise<IntelligenceScoringObservation[]> {
    const observationHistory = await loadObservationHistory(itemId);
    const currentObservation = observationToScoringObservation(current);
    const history = currentObservation ? uniqueSortedHistory([...observationHistory, currentObservation]) : observationHistory;
    if (history.length >= 12) return history;

    const warmStart = await loadWarmStartHistory(itemId);
    return uniqueSortedHistory([...warmStart, ...history]);
}

function baselineCents(scoring: IntelligenceScoringResult): number | null {
    return scoring.metrics.movingAvgPriceCents ?? scoring.metrics.movingAvgPrice7dCents;
}

function eventType(previous: SignalRecord | null, signalType: IntelligenceSignalType, band: ConfidenceBand): string {
    if (!previous) return "detected";
    if (previous.signalType !== signalType) return "transitioned";
    const previousBand = confidenceBand(previous.confidence);
    if (previousBand !== band) return "confidence_changed";
    return "confirmed";
}

function shouldCreateEvent(previous: SignalRecord | null, signalType: IntelligenceSignalType, confidence: number): boolean {
    if (!previous) return true;
    if (previous.signalType !== signalType) return true;
    if (confidenceBand(previous.confidence) !== confidenceBand(confidence)) return true;
    return confidence >= HIGH_CONFIDENCE_THRESHOLD;
}

async function upsertSignal(itemId: string, scoring: IntelligenceScoringResult, now: Date, metadata: Record<string, unknown>): Promise<SignalRecord> {
    const priceCents = scoring.metrics.currentPriceCents;
    const baseline = baselineCents(scoring);
    await prisma.intelligenceSignal.updateMany({
        where: {
            itemId,
            status: "active",
            signalType: { not: scoring.signalType },
        },
        data: {
            status: "stale",
            staleAt: now,
            lastSeenAt: now,
        },
    });

    const record = await prisma.intelligenceSignal.upsert({
        where: {
            itemId_signalType_status: {
                itemId,
                signalType: scoring.signalType,
                status: "active",
            },
        },
        create: {
            itemId,
            signalType: scoring.signalType,
            status: "active",
            confidence: scoring.confidence,
            detectedAt: now,
            lastSeenAt: now,
            staleAt: scoring.freshness === "fresh" ? null : now,
            priceCents,
            baselineCents: baseline,
            deltaCents: priceCents !== null && baseline !== null ? priceCents - baseline : null,
            reasons: serializeReasons(scoring.reasons),
            metadata: serializeMetadata(metadata),
        },
        update: {
            confidence: scoring.confidence,
            lastSeenAt: now,
            staleAt: scoring.freshness === "fresh" ? null : now,
            priceCents,
            baselineCents: baseline,
            deltaCents: priceCents !== null && baseline !== null ? priceCents - baseline : null,
            reasons: serializeReasons(scoring.reasons),
            metadata: serializeMetadata(metadata),
        },
    });

    return record as SignalRecord;
}

async function appendSignalEventIfNeeded(
    itemId: string,
    signal: SignalRecord,
    previous: SignalRecord | null,
    scoring: IntelligenceScoringResult,
    observedAt: Date,
    metadata: Record<string, unknown>
): Promise<boolean> {
    const band = confidenceBand(scoring.confidence);
    if (!shouldCreateEvent(previous, scoring.signalType, scoring.confidence)) return false;
    const eventMetadata = {
        observedAt: String(metadata.observedAt),
        provider: String(metadata.provider),
        freshness: String(metadata.freshness),
        confidenceBand: band,
    };

    const existing = await prisma.intelligenceSignalEvent.findFirst({
        where: {
            signalId: signal.id,
            itemId,
            signalType: scoring.signalType,
            metadata: { equals: serializeMetadata(eventMetadata) },
        },
        select: { id: true },
    });

    if (existing as SignalEventRecord | null) return false;

    const priceCents = scoring.metrics.currentPriceCents;
    const baseline = baselineCents(scoring);
    await prisma.intelligenceSignalEvent.create({
        data: {
            signalId: signal.id,
            itemId,
            eventType: eventType(previous, scoring.signalType, band),
            signalType: scoring.signalType,
            occurredAt: observedAt,
            confidence: scoring.confidence,
            priceCents,
            baselineCents: baseline,
            deltaCents: priceCents !== null && baseline !== null ? priceCents - baseline : null,
            reasons: serializeReasons(scoring.reasons),
            metadata: serializeMetadata(eventMetadata),
        },
    });

    return true;
}

async function updateObservationScoring(observationId: number, scoring: IntelligenceScoringResult): Promise<void> {
    await prisma.intelligenceObservation.update({
        where: { id: observationId },
        data: {
            confidence: scoring.confidence,
            freshness: scoring.freshness,
            reasons: serializeReasons(scoring.reasons),
        },
    });
}

function validationInput(input: ProcessIntelligenceResultInput) {
    const normalized = input.csfloatResult?.ok ? input.csfloatResult.normalized : undefined;
    return {
        csfloatQuantity: normalized?.quantity ?? null,
        csfloatFloorPriceCents: normalized?.minPriceCents ?? null,
        proxyQuality: input.providerResult.cacheHit.hit ? "medium" as const : "high" as const,
    };
}

export async function processIntelligenceResult(input: ProcessIntelligenceResultInput): Promise<ProcessIntelligenceResultOutput> {
    const now = input.now ?? new Date();
    if (!input.providerResult.ok || !input.providerResult.normalized) {
        return { status: "skipped", reason: "provider_result_not_successful", snapshotCreated: false, eventCreated: false };
    }

    const observedAt = input.providerResult.cacheHit.fetchedAt ?? now;

    try {
        const observation = await createObservation(input, input.providerResult.normalized, observedAt);
        await persistProviderCache(input, input.providerResult.normalized, observedAt);
        const snapshotCreated = await createMinuteDedupedSnapshot(input.itemId, input.providerResult.normalized, observedAt);
        const history = await loadScoringHistory(input.itemId, observation);
        const scoring = scoreMarketIntelligence(history, { now, ...validationInput(input) });
        await updateObservationScoring(observation.id, scoring);

        const previousSignal = await prisma.intelligenceSignal.findFirst({
            where: { itemId: input.itemId, status: "active" },
            orderBy: { lastSeenAt: "desc" },
        }) as SignalRecord | null;

        const metadata = {
            observedAt: observedAt.toISOString(),
            provider: input.providerResult.source,
            freshness: scoring.freshness,
            sampleCount: scoring.metrics.sampleCount,
            filteredSampleCount: scoring.metrics.filteredSampleCount,
        };
        const signal = await upsertSignal(input.itemId, scoring, now, { ...metadata, observationId: observation.id });
        const eventCreated = await appendSignalEventIfNeeded(input.itemId, signal, previousSignal, scoring, observedAt, metadata);

        return {
            status: "success",
            observationId: observation.id,
            snapshotCreated,
            signalId: signal.id,
            eventCreated,
            scoring,
        };
    } catch (error) {
        console.error("[IntelligenceProcessor]", error);
        return {
            status: "failed",
            reason: error instanceof Error ? error.message : "Intelligence processing failed",
            snapshotCreated: false,
            eventCreated: false,
        };
    }
}

export function getIntelligenceConfidenceBand(confidence: number): ConfidenceBand {
    return confidenceBand(confidence);
}

export function getIntelligenceSnapshotSource(): string {
    return INTELLIGENCE_SNAPSHOT_SOURCE;
}
