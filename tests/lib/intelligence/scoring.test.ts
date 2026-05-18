import { describe, expect, it } from "vitest";

import {
    calculateFreshness,
    filterOutlierObservations,
    scoreMarketIntelligence,
    type IntelligenceScoringObservation,
} from "@/lib/market/intelligence/scoring";

const NOW = new Date("2026-05-15T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function observation(hoursAgo: number, priceCents: number, volume: number | null): IntelligenceScoringObservation {
    return {
        observedAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS),
        priceCents,
        volume,
        source: "fixture",
    };
}

function flatHistory(count: number, startHoursAgo: number, stepHours: number, priceCents = 10_000, volume = 100): IntelligenceScoringObservation[] {
    return Array.from({ length: count }, (_, index) => observation(startHoursAgo - index * stepHours, priceCents, volume));
}

describe("calculateFreshness", () => {
    it("classifies fresh, stale, and expired observations", () => {
        expect(calculateFreshness(observation(1, 10_000, 100).observedAt, NOW)).toBe("fresh");
        expect(calculateFreshness(observation(8, 10_000, 100).observedAt, NOW)).toBe("stale");
        expect(calculateFreshness(observation(30, 10_000, 100).observedAt, NOW)).toBe("expired");
    });
});

describe("filterOutlierObservations", () => {
    it("suppresses a single unconfirmed price outlier", () => {
        const observations = [
            ...flatHistory(12, 30, 2, 10_000, 100),
            observation(1, 80_000, 120),
        ];

        const filtered = filterOutlierObservations(observations);

        expect(filtered).toHaveLength(12);
        expect(filtered.at(-1)?.priceCents).toBe(10_000);
    });

    it("filters an outlier with only one adjacent confirming sample", () => {
        const observations = [
            ...flatHistory(12, 30, 2, 10_000, 100),
            observation(2, 50_000, 180),
            observation(1, 51_000, 190),
        ];

        const filtered = filterOutlierObservations(observations);

        expect(filtered).toHaveLength(12);
        expect(filtered.every((obs) => obs.priceCents === 10_000)).toBe(true);
    });

    it("keeps an outlier when at least two adjacent samples confirm the move", () => {
        const observations = [
            ...flatHistory(12, 30, 2, 10_000, 100),
            observation(3, 50_000, 170),
            observation(2, 51_000, 180),
            observation(1, 52_000, 190),
        ];

        const filtered = filterOutlierObservations(observations);

        expect(filtered).toHaveLength(15);
        expect(filtered.some((obs) => obs.priceCents === 50_000)).toBe(true);
    });
});

describe("scoreMarketIntelligence", () => {
    it("detects Accumulation from a volume spike with stable price", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(12, 30, 2.5, 10_000, 100),
            observation(1, 10_200, 320),
        ], {
            now: NOW,
            csfloatQuantity: 80,
            csfloatFloorPriceCents: 10_150,
            proxyQuality: "high",
        });

        expect(result.signalType).toBe("accumulation");
        expect(result.confidence).toBeGreaterThan(60);
        expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
            "accumulation-volume-spike",
            "accumulation-price-stable",
            "csfloat-validation-confirmed",
        ]));
    });

    it("detects Pump from a 7d price breakout with upward volume trend", () => {
        const baseline = flatHistory(24, 180, 7, 10_000, 100).map((item, index) => ({
            ...item,
            volume: index < 18 ? 100 : 150,
        }));
        const result = scoreMarketIntelligence([
            ...baseline,
            observation(3, 12_400, 230),
            observation(2, 12_500, 240),
            observation(1, 12_600, 260),
        ], {
            now: NOW,
            csfloatQuantity: 40,
            csfloatFloorPriceCents: 12_400,
        });

        expect(result.signalType).toBe("pump");
        expect(result.confidence).toBeGreaterThan(55);
        expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
            "pump-price-breakout",
            "pump-volume-trend-up",
        ]));
    });

    it("emits a low-confidence Pump pressure proxy from CSFloat floor divergence when normal thresholds do not match", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(24, 180, 7, 10_000, 100),
            observation(1, 10_100, 110),
        ], {
            now: NOW,
            csfloatQuantity: 25,
            csfloatFloorPriceCents: 11_500,
        });

        expect(result.signalType).toBe("pump");
        expect(result.confidence).toBeLessThan(55);
        expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
            "pump-pressure-csfloat-floor-divergence",
            "pump-pressure-low-confidence-proxy",
        ]));
        expect(result.reasons.map((reason) => reason.code)).not.toContain("pump-price-breakout");
    });

    it("keeps neutral scoring when CSFloat floor is missing or quantity is zero", () => {
        const observations = [
            ...flatHistory(24, 180, 7, 10_000, 100),
            observation(1, 10_100, 110),
        ];
        const missingFloor = scoreMarketIntelligence(observations, {
            now: NOW,
            csfloatQuantity: 25,
            csfloatFloorPriceCents: null,
        });
        const zeroQuantity = scoreMarketIntelligence(observations, {
            now: NOW,
            csfloatQuantity: 0,
            csfloatFloorPriceCents: 11_500,
        });

        expect(missingFloor.signalType).toBe("neutral");
        expect(zeroQuantity.signalType).toBe("neutral");
        expect(missingFloor.reasons.map((reason) => reason.code)).not.toContain("pump-pressure-csfloat-floor-divergence");
        expect(zeroQuantity.reasons.map((reason) => reason.code)).not.toContain("pump-pressure-csfloat-floor-divergence");
    });

    it("keeps normal Pump priority and reasons over the CSFloat pressure proxy", () => {
        const baseline = flatHistory(24, 180, 7, 10_000, 100).map((item, index) => ({
            ...item,
            volume: index < 18 ? 100 : 150,
        }));
        const result = scoreMarketIntelligence([
            ...baseline,
            observation(3, 12_400, 230),
            observation(2, 12_500, 240),
            observation(1, 12_600, 260),
        ], {
            now: NOW,
            csfloatQuantity: 40,
            csfloatFloorPriceCents: 15_000,
        });

        expect(result.signalType).toBe("pump");
        expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
            "pump-price-breakout",
            "pump-volume-trend-up",
        ]));
        expect(result.reasons.map((reason) => reason.code)).not.toContain("pump-pressure-csfloat-floor-divergence");
    });

    it("detects Dump when current price falls below 85% of the 24h peak", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(10, 30, 2, 10_000, 100),
            observation(12, 12_200, 135),
            observation(11, 12_100, 130),
            observation(10, 12_000, 130),
            observation(2, 9_900, 125),
            observation(1, 9_800, 120),
        ], {
            now: NOW,
            csfloatQuantity: 25,
            csfloatFloorPriceCents: 9_700,
        });

        expect(result.signalType).toBe("dump");
        expect(result.reasons.map((reason) => reason.code)).toContain("dump-price-below-peak");
    });

    it("returns Neutral when no thresholds match", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(12, 30, 2.5, 10_000, 100),
            observation(1, 10_100, 110),
        ], { now: NOW, csfloatQuantity: 30, csfloatFloorPriceCents: 10_100 });

        expect(result.signalType).toBe("neutral");
        expect(result.reasons.map((reason) => reason.code)).toContain("neutral-no-threshold-match");
    });

    it("suppresses non-neutral signals when minimum history is insufficient", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(8, 10, 1, 10_000, 100),
            observation(1, 8_000, 400),
        ], { now: NOW });

        expect(result.signalType).toBe("neutral");
        expect(result.reasons.map((reason) => reason.code)).toContain("insufficient-history");
    });

    it("suppresses non-neutral signals when moving average volume is zero", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(12, 30, 2.5, 10_000, 0),
            observation(1, 10_100, 500),
        ], { now: NOW });

        expect(result.signalType).toBe("neutral");
        expect(result.reasons.map((reason) => reason.code)).toContain("zero-volume-baseline");
    });

    it("reduces confidence and adds a reason for stale data", () => {
        const fresh = scoreMarketIntelligence([
            ...flatHistory(12, 38, 2.5, 10_000, 100),
            observation(1, 10_100, 320),
        ], { now: NOW, csfloatQuantity: 30, csfloatFloorPriceCents: 10_100 });
        const stale = scoreMarketIntelligence([
            ...flatHistory(12, 45, 2.5, 10_000, 100),
            observation(8, 10_100, 320),
        ], { now: NOW, csfloatQuantity: 30, csfloatFloorPriceCents: 10_100 });

        expect(stale.freshness).toBe("stale");
        expect(stale.confidence).toBeLessThan(fresh.confidence);
        expect(stale.reasons.map((reason) => reason.code)).toContain("freshness-stale");
    });

    it("suppresses a signal when the current point is an unconfirmed outlier", () => {
        const result = scoreMarketIntelligence([
            ...flatHistory(24, 180, 7, 10_000, 100),
            observation(1, 80_000, 300),
        ], { now: NOW, csfloatQuantity: 50, csfloatFloorPriceCents: 10_000 });

        expect(result.signalType).toBe("neutral");
        expect(result.metrics.outlierCount).toBe(1);
        expect(result.reasons.map((reason) => reason.code)).toContain("outlier-observations-filtered");
    });

    it("uses Dump > Pump > Accumulation conflict priority and lists secondary matches", () => {
        const olderHighBaseline = flatHistory(12, 320, 10, 16_000, 100);
        const sevenDayBaseline = flatHistory(25, 150, 6, 10_000, 100).map((item, index) => ({
            ...item,
            volume: index < 18 ? 100 : 180,
        }));
        const result = scoreMarketIntelligence([
            ...olderHighBaseline,
            ...sevenDayBaseline,
            observation(4, 15_800, 220),
            observation(3, 16_000, 240),
            observation(2, 16_200, 260),
            observation(1, 12_800, 700),
        ], {
            now: NOW,
            csfloatQuantity: 70,
            csfloatFloorPriceCents: 12_700,
            proxyQuality: "high",
        });

        expect(result.signalType).toBe("dump");
        expect(result.secondarySignals.map((signal) => signal.signalType)).toEqual(["pump", "accumulation"]);
        expect(result.reasons.map((reason) => reason.code)).toContain("secondary-signal-match");
    });
});
