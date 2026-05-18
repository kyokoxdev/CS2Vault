const ACCUMULATION_VOLUME_MULTIPLIER = 2.5;
const ACCUMULATION_MAX_PRICE_DELTA = 0.05;
const PUMP_PRICE_MULTIPLIER = 1.2;
const CSFLOAT_FLOOR_DIVERGENCE_MULTIPLIER = 1.12;
const DUMP_PEAK_MULTIPLIER = 0.85;
const OUTLIER_STDDEV_MULTIPLIER = 3;
const OUTLIER_WINDOW_SIZE = 12;
const MIN_BASELINE_STDDEV_RATIO = 0.01;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type IntelligenceSignalType = "accumulation" | "pump" | "dump" | "neutral";
export type IntelligenceFreshness = "fresh" | "stale" | "expired";
export type IntelligenceProxyQuality = "high" | "medium" | "low";

export interface IntelligenceScoringObservation {
    observedAt: Date;
    priceCents: number;
    volume: number | null;
    source?: string;
}

export interface IntelligenceValidationInput {
    csfloatQuantity?: number | null;
    csfloatFloorPriceCents?: number | null;
    proxyQuality?: IntelligenceProxyQuality;
}

export interface IntelligenceScoringOptions extends IntelligenceValidationInput {
    now?: Date;
    freshMs?: number;
    staleMs?: number;
}

export interface IntelligenceSignalReason {
    code: string;
    label: string;
    signalType?: IntelligenceSignalType;
}

export interface IntelligenceSecondarySignal {
    signalType: Exclude<IntelligenceSignalType, "neutral">;
    confidence: number;
    reasons: IntelligenceSignalReason[];
}

export interface IntelligenceScoringMetrics {
    sampleCount: number;
    filteredSampleCount: number;
    outlierCount: number;
    historyHours: number;
    currentPriceCents: number | null;
    movingAvgPriceCents: number | null;
    movingAvgPrice7dCents: number | null;
    currentVolume: number | null;
    movingAvgVolume: number;
    peakPrice24hCents: number | null;
    volumeTrend: "upward" | "stable" | "downward";
}

export interface IntelligenceScoringResult {
    signalType: IntelligenceSignalType;
    confidence: number;
    freshness: IntelligenceFreshness;
    reasons: IntelligenceSignalReason[];
    secondarySignals: IntelligenceSecondarySignal[];
    metrics: IntelligenceScoringMetrics;
}

interface CandidateSignal {
    signalType: Exclude<IntelligenceSignalType, "neutral">;
    strength: number;
    reasons: IntelligenceSignalReason[];
}

interface OutlierDecision {
    observation: IntelligenceScoringObservation;
    outlier: boolean;
}

const signalPriority: Record<IntelligenceSignalType, number> = {
    dump: 3,
    pump: 2,
    accumulation: 1,
    neutral: 0,
};

function isUsableObservation(observation: IntelligenceScoringObservation): boolean {
    return observation.observedAt instanceof Date
        && Number.isFinite(observation.observedAt.getTime())
        && Number.isFinite(observation.priceCents)
        && observation.priceCents > 0;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = average(values);
    const variance = average(values.map((value) => (value - mean) ** 2));
    return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundConfidence(value: number): number {
    return Math.round(clamp(value, 0, 100));
}

function roundNullable(value: number | null): number | null {
    return value === null ? null : Math.round(value);
}

function sortObservations(observations: IntelligenceScoringObservation[]): IntelligenceScoringObservation[] {
    return observations
        .filter(isUsableObservation)
        .slice()
        .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
}

function isOutlierAgainstWindow(observation: IntelligenceScoringObservation, window: IntelligenceScoringObservation[]): boolean {
    if (window.length < 6) return false;
    const prices = window.map((item) => item.priceCents);
    const mean = average(prices);
    const stddev = standardDeviation(prices);
    const minimumStddev = Math.max(1, mean * MIN_BASELINE_STDDEV_RATIO);
    const effectiveStddev = Math.max(stddev, minimumStddev);
    return Math.abs(observation.priceCents - mean) > effectiveStddev * OUTLIER_STDDEV_MULTIPLIER;
}

function countAdjacentConfirmations(index: number, observations: IntelligenceScoringObservation[]): number {
    const windowStart = Math.max(0, index - OUTLIER_WINDOW_SIZE);
    const window = observations.slice(windowStart, index);
    if (window.length < 6) return 0;

    const prices = window.map((item) => item.priceCents);
    const mean = average(prices);
    const stddev = Math.max(standardDeviation(prices), Math.max(1, mean * MIN_BASELINE_STDDEV_RATIO));
    const threshold = stddev * OUTLIER_STDDEV_MULTIPLIER;
    const current = observations[index];
    const direction = current.priceCents > mean ? 1 : -1;

    const adjacentIndices = [index - 2, index - 1, index + 1, index + 2];
    let count = 0;
    for (const adjIndex of adjacentIndices) {
        if (adjIndex < 0 || adjIndex >= observations.length) continue;
        const adjacent = observations[adjIndex];
        const adjacentDirection = adjacent.priceCents > mean ? 1 : -1;
        if (adjacentDirection === direction && Math.abs(adjacent.priceCents - mean) > threshold) {
            count++;
        }
    }
    return count;
}

export function filterOutlierObservations(observations: IntelligenceScoringObservation[]): IntelligenceScoringObservation[] {
    return classifyOutliers(observations)
        .filter((decision) => !decision.outlier)
        .map((decision) => decision.observation);
}

function classifyOutliers(observations: IntelligenceScoringObservation[]): OutlierDecision[] {
    const sorted = sortObservations(observations);
    return sorted.map((observation, index) => {
        const windowStart = Math.max(0, index - OUTLIER_WINDOW_SIZE);
        const window = sorted.slice(windowStart, index);
        const outlier = isOutlierAgainstWindow(observation, window) && countAdjacentConfirmations(index, sorted) < 2;
        return { observation, outlier };
    });
}

export function calculateFreshness(latestObservedAt: Date | null, now: Date = new Date(), freshMs = 2 * HOUR_MS, staleMs = 24 * HOUR_MS): IntelligenceFreshness {
    if (!latestObservedAt) return "expired";
    const ageMs = now.getTime() - latestObservedAt.getTime();
    if (ageMs <= freshMs) return "fresh";
    if (ageMs <= staleMs) return "stale";
    return "expired";
}

function buildMetrics(observations: IntelligenceScoringObservation[]): IntelligenceScoringMetrics {
    const current = observations.at(-1) ?? null;
    const previous = current ? observations.slice(0, -1) : observations;
    const first = observations[0] ?? null;
    const historyHours = first && current ? (current.observedAt.getTime() - first.observedAt.getTime()) / HOUR_MS : 0;
    const currentTime = current?.observedAt.getTime() ?? 0;
    const sevenDayBaseline = previous.filter((item) => currentTime - item.observedAt.getTime() <= 7 * DAY_MS);
    const last24h = observations.filter((item) => currentTime - item.observedAt.getTime() <= DAY_MS);
    const volumes = previous
        .map((item) => item.volume)
        .filter((volume): volume is number => typeof volume === "number" && Number.isFinite(volume) && volume > 0);

    return {
        sampleCount: observations.length,
        filteredSampleCount: observations.length,
        outlierCount: 0,
        historyHours,
        currentPriceCents: current?.priceCents ?? null,
        movingAvgPriceCents: previous.length > 0 ? roundNullable(average(previous.map((item) => item.priceCents))) : null,
        movingAvgPrice7dCents: sevenDayBaseline.length > 0 ? roundNullable(average(sevenDayBaseline.map((item) => item.priceCents))) : null,
        currentVolume: current?.volume ?? null,
        movingAvgVolume: volumes.length > 0 ? average(volumes) : 0,
        peakPrice24hCents: last24h.length > 0 ? Math.max(...last24h.map((item) => item.priceCents)) : null,
        volumeTrend: getRecentVolumeTrend(observations),
    };
}

function getRecentVolumeTrend(observations: IntelligenceScoringObservation[]): "upward" | "stable" | "downward" {
    const volumes = observations
        .map((item) => item.volume)
        .filter((volume): volume is number => typeof volume === "number" && Number.isFinite(volume) && volume > 0);
    if (volumes.length < 6) return "stable";
    const recent = volumes.slice(-3);
    const previous = volumes.slice(-6, -3);
    const previousAverage = average(previous);
    const recentAverage = average(recent);
    if (previousAverage === 0 && recentAverage > 0) return "upward";
    if (previousAverage === 0) return "stable";
    if (recentAverage > previousAverage * 1.15) return "upward";
    if (recentAverage < previousAverage * 0.85) return "downward";
    return "stable";
}

function hasGate(metrics: IntelligenceScoringMetrics, minimumHours: number, minimumSamples: number): boolean {
    return metrics.historyHours >= minimumHours
        && metrics.filteredSampleCount >= minimumSamples
        && metrics.movingAvgVolume > 0;
}

function evaluateAccumulation(metrics: IntelligenceScoringMetrics): CandidateSignal | null {
    if (!hasGate(metrics, 24, 12)) return null;
    if (metrics.currentVolume === null || metrics.movingAvgPriceCents === null || metrics.currentPriceCents === null) return null;
    const volumeRatio = metrics.currentVolume / metrics.movingAvgVolume;
    const priceDelta = Math.abs(metrics.currentPriceCents - metrics.movingAvgPriceCents) / metrics.movingAvgPriceCents;
    if (volumeRatio <= ACCUMULATION_VOLUME_MULTIPLIER || priceDelta >= ACCUMULATION_MAX_PRICE_DELTA) return null;

    const volumeStrength = clamp((volumeRatio - ACCUMULATION_VOLUME_MULTIPLIER) / ACCUMULATION_VOLUME_MULTIPLIER, 0, 1);
    const stabilityStrength = clamp((ACCUMULATION_MAX_PRICE_DELTA - priceDelta) / ACCUMULATION_MAX_PRICE_DELTA, 0, 1);
    return {
        signalType: "accumulation",
        strength: volumeStrength * 0.7 + stabilityStrength * 0.3,
        reasons: [
            { code: "accumulation-volume-spike", label: `Current volume is ${volumeRatio.toFixed(2)}x the moving average`, signalType: "accumulation" },
            { code: "accumulation-price-stable", label: "Price remains within 5% of its moving average", signalType: "accumulation" },
        ],
    };
}

function evaluatePump(metrics: IntelligenceScoringMetrics): CandidateSignal | null {
    if (!hasGate(metrics, 7 * 24, 24)) return null;
    if (metrics.currentPriceCents === null || metrics.movingAvgPrice7dCents === null) return null;
    const priceRatio = metrics.currentPriceCents / metrics.movingAvgPrice7dCents;
    if (priceRatio <= PUMP_PRICE_MULTIPLIER || metrics.volumeTrend !== "upward") return null;

    return {
        signalType: "pump",
        strength: clamp((priceRatio - PUMP_PRICE_MULTIPLIER) / 0.3, 0, 1),
        reasons: [
            { code: "pump-price-breakout", label: `Current price is ${(priceRatio * 100).toFixed(1)}% of the 7d moving average`, signalType: "pump" },
            { code: "pump-volume-trend-up", label: "Recent volume trend is upward", signalType: "pump" },
        ],
    };
}

function evaluatePumpPressureProxy(metrics: IntelligenceScoringMetrics, options: IntelligenceValidationInput): CandidateSignal | null {
    if (!hasGate(metrics, 7 * 24, 24)) return null;
    if (metrics.currentPriceCents === null || metrics.movingAvgPrice7dCents === null) return null;
    const quantity = options.csfloatQuantity;
    const floor = options.csfloatFloorPriceCents;
    if (typeof quantity !== "number" || typeof floor !== "number" || quantity <= 0 || floor <= 0) return null;

    const referencePriceCents = Math.max(metrics.currentPriceCents, metrics.movingAvgPrice7dCents);
    const floorRatio = floor / referencePriceCents;
    if (floorRatio < CSFLOAT_FLOOR_DIVERGENCE_MULTIPLIER) return null;

    return {
        signalType: "pump",
        strength: clamp((floorRatio - CSFLOAT_FLOOR_DIVERGENCE_MULTIPLIER) / 0.25, 0, 0.25),
        reasons: [
            { code: "pump-pressure-csfloat-floor-divergence", label: `CSFloat floor is ${(floorRatio * 100).toFixed(1)}% of the SCM reference price`, signalType: "pump" },
            { code: "pump-pressure-low-confidence-proxy", label: "CSFloat floor pressure created a low-confidence pump proxy", signalType: "pump" },
        ],
    };
}

function evaluateDump(metrics: IntelligenceScoringMetrics): CandidateSignal | null {
    if (!hasGate(metrics, 24, 12)) return null;
    if (metrics.currentPriceCents === null || metrics.peakPrice24hCents === null) return null;
    const peakRatio = metrics.currentPriceCents / metrics.peakPrice24hCents;
    if (peakRatio >= DUMP_PEAK_MULTIPLIER) return null;

    return {
        signalType: "dump",
        strength: clamp((DUMP_PEAK_MULTIPLIER - peakRatio) / 0.25, 0, 1),
        reasons: [
            { code: "dump-price-below-peak", label: `Current price is ${(peakRatio * 100).toFixed(1)}% of the 24h peak`, signalType: "dump" },
        ],
    };
}

function validationConfidenceAdjustment(
    signal: IntelligenceSignalType,
    currentPriceCents: number | null,
    options: IntelligenceValidationInput,
    reasons: IntelligenceSignalReason[]
): number {
    let adjustment = 0;
    const proxyQuality = options.proxyQuality ?? "medium";
    if (proxyQuality === "high") adjustment += 8;
    if (proxyQuality === "low") {
        adjustment -= 10;
        reasons.push({ code: "low-proxy-quality", label: "Low proxy quality reduced confidence", signalType: signal });
    }

    const quantity = options.csfloatQuantity;
    const floor = options.csfloatFloorPriceCents;
    if (typeof quantity !== "number" || typeof floor !== "number" || currentPriceCents === null || quantity <= 0 || floor <= 0) {
        reasons.push({ code: "csfloat-validation-missing", label: "CSFloat supply/floor validation was unavailable", signalType: signal });
        return adjustment - 5;
    }

    const floorDelta = Math.abs(floor - currentPriceCents) / currentPriceCents;
    if (quantity >= 10 && floorDelta <= 0.1) {
        reasons.push({ code: "csfloat-validation-confirmed", label: "CSFloat supply and floor price confirm the signal", signalType: signal });
        return adjustment + 10;
    }

    reasons.push({ code: "csfloat-validation-weak", label: "CSFloat supply or floor price weakens confidence", signalType: signal });
    return adjustment - 10;
}

function freshnessConfidenceAdjustment(freshness: IntelligenceFreshness, signal: IntelligenceSignalType, reasons: IntelligenceSignalReason[]): number {
    if (freshness === "fresh") return 0;
    if (freshness === "stale") {
        reasons.push({ code: "freshness-stale", label: "Latest observation is stale, reducing confidence", signalType: signal });
        return -20;
    }
    reasons.push({ code: "freshness-expired", label: "Latest observation is expired, heavily reducing confidence", signalType: signal });
    return -45;
}

function confidenceForSignal(candidate: CandidateSignal, freshness: IntelligenceFreshness, metrics: IntelligenceScoringMetrics, options: IntelligenceScoringOptions): IntelligenceSecondarySignal {
    const reasons = candidate.reasons.slice();
    const base = 45 + candidate.strength * 35;
    const confidence = roundConfidence(
        base
        + freshnessConfidenceAdjustment(freshness, candidate.signalType, reasons)
        + validationConfidenceAdjustment(candidate.signalType, metrics.currentPriceCents, options, reasons)
    );
    return { signalType: candidate.signalType, confidence, reasons };
}

function buildNeutralResult(freshness: IntelligenceFreshness, metrics: IntelligenceScoringMetrics, options: IntelligenceScoringOptions, reasons: IntelligenceSignalReason[]): IntelligenceScoringResult {
    const neutralReasons: IntelligenceSignalReason[] = reasons.length > 0
        ? reasons
        : [{ code: "neutral-no-threshold-match", label: "No v1 signal thresholds matched", signalType: "neutral" }];
    const confidence = roundConfidence(
        45
        + freshnessConfidenceAdjustment(freshness, "neutral", neutralReasons)
        + validationConfidenceAdjustment("neutral", metrics.currentPriceCents, options, neutralReasons)
    );
    return {
        signalType: "neutral",
        confidence,
        freshness,
        reasons: neutralReasons,
        secondarySignals: [],
        metrics,
    };
}

export function scoreMarketIntelligence(
    observations: IntelligenceScoringObservation[],
    options: IntelligenceScoringOptions = {}
): IntelligenceScoringResult {
    const outlierDecisions = classifyOutliers(observations);
    const filteredObservations = outlierDecisions.filter((decision) => !decision.outlier).map((decision) => decision.observation);
    const outlierCount = outlierDecisions.length - filteredObservations.length;
    const metrics = buildMetrics(filteredObservations);
    metrics.sampleCount = outlierDecisions.length;
    metrics.filteredSampleCount = filteredObservations.length;
    metrics.outlierCount = outlierCount;

    const now = options.now ?? new Date();
    const latestObservedAt = filteredObservations.at(-1)?.observedAt ?? null;
    const freshness = calculateFreshness(latestObservedAt, now, options.freshMs, options.staleMs);
    const gateReasons: IntelligenceSignalReason[] = [];

    if (outlierCount > 0) {
        gateReasons.push({ code: "outlier-observations-filtered", label: `${outlierCount} price observation(s) were filtered as unconfirmed outliers` });
    }
    if (filteredObservations.length === 0) {
        gateReasons.push({ code: "insufficient-history", label: "No usable observations were available", signalType: "neutral" });
        return buildNeutralResult(freshness, metrics, options, gateReasons);
    }
    if (metrics.movingAvgVolume === 0) {
        gateReasons.push({ code: "zero-volume-baseline", label: "Moving average volume is zero, suppressing non-neutral signals", signalType: "neutral" });
        return buildNeutralResult(freshness, metrics, options, gateReasons);
    }

    const candidates = [evaluateAccumulation(metrics), evaluatePump(metrics), evaluateDump(metrics)]
        .filter((candidate): candidate is CandidateSignal => candidate !== null)
        .sort((a, b) => signalPriority[b.signalType] - signalPriority[a.signalType]);

    if (candidates.length === 0) {
        const proxyCandidate = evaluatePumpPressureProxy(metrics, options);
        if (proxyCandidate) {
            const proxy = confidenceForSignal(proxyCandidate, freshness, metrics, options);
            return {
                signalType: proxy.signalType,
                confidence: proxy.confidence,
                freshness,
                reasons: [...gateReasons, ...proxy.reasons],
                secondarySignals: [],
                metrics,
            };
        }
        if (metrics.filteredSampleCount < 12 || metrics.historyHours < 24) {
            gateReasons.push({ code: "insufficient-history", label: "Minimum history gate was not met", signalType: "neutral" });
        }
        return buildNeutralResult(freshness, metrics, options, gateReasons);
    }

    const scored = candidates.map((candidate) => confidenceForSignal(candidate, freshness, metrics, options));
    const primary = scored[0];
    const secondarySignals = scored.slice(1);
    const conflictReasons = secondarySignals.map((signal) => ({
        code: "secondary-signal-match",
        label: `${signal.signalType} also matched but lower conflict priority kept ${primary.signalType} primary`,
        signalType: signal.signalType,
    }));

    return {
        signalType: primary.signalType,
        confidence: primary.confidence,
        freshness,
        reasons: [...gateReasons, ...primary.reasons, ...conflictReasons],
        secondarySignals,
        metrics,
    };
}
