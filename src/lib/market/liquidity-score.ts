export type LiquidityRating = "low" | "medium" | "high";
export type LiquidityTrend = "increasing" | "stable" | "decreasing";

export interface LiquidityCandle {
    volume: number;
}

export interface LiquidityScoreResult {
    score: number;
    rating: LiquidityRating;
    averageVolume: number;
    recentVolume: number;
    trend: LiquidityTrend;
}

function getTrend(volumes: number[]): LiquidityTrend {
    if (volumes.length < 6) {
        return "stable";
    }

    const midpoint = Math.floor(volumes.length / 2);
    const previous = volumes.slice(0, midpoint);
    const recent = volumes.slice(midpoint);
    const previousAverage = previous.reduce((sum, volume) => sum + volume, 0) / previous.length;
    const recentAverage = recent.reduce((sum, volume) => sum + volume, 0) / recent.length;

    if (previousAverage === 0 && recentAverage > 0) {
        return "increasing";
    }

    if (previousAverage === 0) {
        return "stable";
    }

    if (recentAverage > previousAverage * 1.15) {
        return "increasing";
    }

    if (recentAverage < previousAverage * 0.85) {
        return "decreasing";
    }

    return "stable";
}

export function calculateLiquidityScore(candles: LiquidityCandle[]): LiquidityScoreResult | null {
    const volumes = candles
        .map((candle) => candle.volume)
        .filter((volume) => Number.isFinite(volume) && volume > 0);

    if (volumes.length === 0) {
        return null;
    }

    const recentVolumes = volumes.slice(-14);
    const recentVolume = recentVolumes.reduce((sum, volume) => sum + volume, 0);
    const averageVolume = recentVolume / recentVolumes.length;
    const maxVolume = Math.max(...recentVolumes);
    const activeRatio = recentVolumes.length / Math.min(candles.length, 14);
    const magnitudeScore = Math.min(1, Math.log10(averageVolume + 1) / 3);
    const consistencyScore = maxVolume === 0 ? 0 : averageVolume / maxVolume;
    const score = Math.round(
        Math.max(0, Math.min(1, magnitudeScore * 0.65 + consistencyScore * 0.2 + activeRatio * 0.15)) * 100
    );

    return {
        score,
        rating: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
        averageVolume: Math.round(averageVolume),
        recentVolume,
        trend: getTrend(recentVolumes),
    };
}
