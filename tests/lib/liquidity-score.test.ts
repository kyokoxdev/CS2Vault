import { describe, expect, it } from "vitest";

import { calculateLiquidityScore } from "@/lib/market/liquidity-score";

describe("calculateLiquidityScore", () => {
    it("returns null when candles have no usable volume", () => {
        expect(calculateLiquidityScore([])).toBeNull();
    });

    it("returns a proxy score when volume is zero or invalid", () => {
        const result = calculateLiquidityScore([{ volume: 0 }, { volume: -1 }]);
        expect(result).not.toBeNull();
        expect(result?.score).toBeGreaterThanOrEqual(0);
        expect(result?.averageVolume).toBe(0);
    });

    it("scores liquid items from sustained high volume", () => {
        const result = calculateLiquidityScore(Array.from({ length: 14 }, () => ({ volume: 900 })));

        expect(result).toEqual({
            score: 99,
            rating: "high",
            averageVolume: 900,
            recentVolume: 12600,
            trend: "stable",
        });
    });

    it("marks low sparse volume as low liquidity", () => {
        const result = calculateLiquidityScore([
            { volume: 0 },
            { volume: 1 },
            { volume: 0 },
            { volume: 2 },
        ]);

        expect(result?.rating).toBe("low");
        expect(result?.averageVolume).toBe(2);
    });

    it("detects increasing and decreasing volume trends", () => {
        expect(calculateLiquidityScore([
            { volume: 10 },
            { volume: 12 },
            { volume: 11 },
            { volume: 40 },
            { volume: 42 },
            { volume: 44 },
        ])?.trend).toBe("increasing");

        expect(calculateLiquidityScore([
            { volume: 44 },
            { volume: 42 },
            { volume: 40 },
            { volume: 11 },
            { volume: 12 },
            { volume: 10 },
        ])?.trend).toBe("decreasing");
    });
});
