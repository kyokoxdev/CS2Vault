export interface ChartCandlePoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface ChartLinePoint {
    time: number;
    value: number;
}

export interface ChartVolumePoint extends ChartLinePoint {
    color: string;
}

export interface ChartStats {
    startPrice: number;
    endPrice: number;
    delta: number;
    changePercent: number;
    high: number;
    low: number;
    averageVolume: number;
    totalVolume: number;
    candleCount: number;
    trend: "up" | "down" | "flat";
}

export function toLineSeriesData(candles: ChartCandlePoint[]): ChartLinePoint[] {
    return candles.map((candle) => ({
        time: candle.time,
        value: candle.close,
    }));
}

export function toVolumeSeriesData(
    candles: ChartCandlePoint[],
    colors: { bull: string; bear: string }
): ChartVolumePoint[] {
    return candles.map((candle) => ({
        time: candle.time,
        value: candle.volume,
        color: candle.close >= candle.open ? colors.bull : colors.bear,
    }));
}

export function calculateSimpleMovingAverage(
    candles: ChartCandlePoint[],
    period: number
): ChartLinePoint[] {
    if (period <= 0 || candles.length < period) {
        return [];
    }

    const movingAverage: ChartLinePoint[] = [];
    let rollingSum = 0;

    for (let index = 0; index < candles.length; index++) {
        rollingSum += candles[index].close;

        if (index >= period) {
            rollingSum -= candles[index - period].close;
        }

        if (index >= period - 1) {
            movingAverage.push({
                time: candles[index].time,
                value: rollingSum / period,
            });
        }
    }

    return movingAverage;
}

export function calculateChartStats(candles: ChartCandlePoint[]): ChartStats | null {
    if (candles.length === 0) {
        return null;
    }

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let totalVolume = 0;

    for (const candle of candles) {
        high = Math.max(high, candle.high);
        low = Math.min(low, candle.low);
        totalVolume += candle.volume;
    }

    const startPrice = candles[0].open;
    const endPrice = candles[candles.length - 1].close;
    const delta = endPrice - startPrice;
    const changePercent = startPrice === 0 ? 0 : (delta / startPrice) * 100;
    const averageVolume = totalVolume / candles.length;

    return {
        startPrice,
        endPrice,
        delta,
        changePercent,
        high,
        low,
        averageVolume,
        totalVolume,
        candleCount: candles.length,
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    };
}
