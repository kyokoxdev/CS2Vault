import { ChartCandlePoint } from "@/components/charts/chart-utils";
import { getIndicatorById } from "./indicator-registry";

export interface IndicatorDataPoint {
  time: number;
  value?: number;
  values?: number[];
}

interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp: number;
}

function convertCandlesToBars(candles: ChartCandlePoint[]): Bar[] {
  return candles.map((candle) => ({
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    timestamp: typeof candle.time === "number" ? candle.time : new Date(candle.time).getTime(),
  }));
}

export function calculateIndicator(
  indicatorId: string,
  candles: ChartCandlePoint[],
  inputs?: Record<string, number>
): IndicatorDataPoint[] {
  const indicator = getIndicatorById(indicatorId);
  if (!indicator) {
    return [];
  }

  if (candles.length === 0) {
    return [];
  }

  try {
    const bars = convertCandlesToBars(candles);
    const mergedInputs = { ...indicator.defaultInputs, ...inputs };

    switch (indicatorId) {
      case "sma": {
        const length = mergedInputs.length || 14;
        return calculateSMA(bars, length);
      }
      case "ema": {
        const length = mergedInputs.length || 14;
        return calculateEMA(bars, length);
      }
      case "rsi": {
        const length = mergedInputs.length || 14;
        return calculateRSI(bars, length);
      }
      case "bollinger": {
        const length = mergedInputs.length || 20;
        const stdDev = mergedInputs.stdDev || 2;
        return calculateBollingerBands(bars, length, stdDev);
      }
      case "macd": {
        const fast = mergedInputs.fast || 12;
        const slow = mergedInputs.slow || 26;
        const signal = mergedInputs.signal || 9;
        return calculateMACD(bars, fast, slow, signal);
      }
      case "stochastic": {
        const k = mergedInputs.k || 14;
        const d = mergedInputs.d || 3;
        return calculateStochastic(bars, k, d);
      }
      case "vwap": {
        return calculateVWAP(bars);
      }
      case "volume": {
        return calculateVolume(bars);
      }
      default:
        return [];
    }
  } catch (error) {
    console.error(`[IndicatorService] Error calculating ${indicatorId}:`, error);
    return [];
  }
}

function calculateSMA(bars: Bar[], length: number): IndicatorDataPoint[] {
  if (bars.length < length) {
    return [];
  }

  const result: IndicatorDataPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += bars[i - j].close;
    }
    result.push({
      time: bars[i].timestamp,
      value: sum / length,
    });
  }
  return result;
}

function calculateEMA(bars: Bar[], length: number): IndicatorDataPoint[] {
  if (bars.length < length) {
    return [];
  }

  const multiplier = 2 / (length + 1);
  const result: IndicatorDataPoint[] = [];
  let ema = bars.slice(0, length).reduce((sum, bar) => sum + bar.close, 0) / length;

  for (let i = length - 1; i < bars.length; i++) {
    if (i === length - 1) {
      result.push({
        time: bars[i].timestamp,
        value: ema,
      });
    } else {
      ema = (bars[i].close - ema) * multiplier + ema;
      result.push({
        time: bars[i].timestamp,
        value: ema,
      });
    }
  }
  return result;
}

function calculateRSI(bars: Bar[], length: number): IndicatorDataPoint[] {
  if (bars.length < length + 1) {
    return [];
  }

  const result: IndicatorDataPoint[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;

  for (let i = length; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    result.push({
      time: bars[i].timestamp,
      value: Math.round(rsi * 100) / 100,
    });
  }

  return result;
}

function calculateBollingerBands(bars: Bar[], length: number, stdDevMultiplier: number): IndicatorDataPoint[] {
  if (bars.length < length) {
    return [];
  }

  const result: IndicatorDataPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const window = bars.slice(i - length + 1, i + 1);
    const middle = window.reduce((sum, bar) => sum + bar.close, 0) / length;
    const variance = window.reduce((sum, bar) => sum + (bar.close - middle) ** 2, 0) / length;
    const deviation = Math.sqrt(variance) * stdDevMultiplier;

    result.push({
      time: bars[i].timestamp,
      values: [middle + deviation, middle, middle - deviation],
    });
  }

  return result;
}

function calculateMACD(bars: Bar[], fast: number, slow: number, signal: number): IndicatorDataPoint[] {
  if (bars.length < slow + signal) {
    return [];
  }

  const fastValues = calculateEMAValues(bars, fast);
  const slowValues = calculateEMAValues(bars, slow);
  const macdValues = bars.map((bar, index) => {
    const fastValue = fastValues[index];
    const slowValue = slowValues[index];

    if (fastValue === undefined || slowValue === undefined) {
      return undefined;
    }

    return {
      timestamp: bar.timestamp,
      value: fastValue - slowValue,
    };
  });

  const signalValues = calculateSignalValues(macdValues, signal);
  const result: IndicatorDataPoint[] = [];

  for (let i = 0; i < macdValues.length; i++) {
    const macdValue = macdValues[i]?.value;
    const signalValue = signalValues[i];

    if (macdValue === undefined || signalValue === undefined) {
      continue;
    }

    result.push({
      time: bars[i].timestamp,
      values: [macdValue, signalValue, macdValue - signalValue],
    });
  }

  return result;
}

function calculateStochastic(bars: Bar[], k: number, d: number): IndicatorDataPoint[] {
  if (bars.length < k + d - 1) {
    return [];
  }

  const kValues: Array<{ timestamp: number; value: number }> = [];

  for (let i = k - 1; i < bars.length; i++) {
    const window = bars.slice(i - k + 1, i + 1);
    const highestHigh = Math.max(...window.map((bar) => bar.high));
    const lowestLow = Math.min(...window.map((bar) => bar.low));
    const range = highestHigh - lowestLow;
    const value = range === 0 ? 0 : ((bars[i].close - lowestLow) / range) * 100;

    kValues.push({ timestamp: bars[i].timestamp, value });
  }

  const result: IndicatorDataPoint[] = [];
  for (let i = d - 1; i < kValues.length; i++) {
    const dWindow = kValues.slice(i - d + 1, i + 1);
    const dValue = dWindow.reduce((sum, point) => sum + point.value, 0) / d;

    result.push({
      time: kValues[i].timestamp,
      values: [kValues[i].value, dValue],
    });
  }

  return result;
}

function calculateVWAP(bars: Bar[]): IndicatorDataPoint[] {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return bars
    .filter((bar) => bar.volume !== undefined && bar.volume > 0)
    .map((bar) => {
      const typicalPrice = (bar.high + bar.low + bar.close) / 3;
      const volume = bar.volume ?? 0;
      cumulativePriceVolume += typicalPrice * volume;
      cumulativeVolume += volume;

      return {
        time: bar.timestamp,
        value: cumulativePriceVolume / cumulativeVolume,
      };
    });
}

function calculateEMAValues(bars: Bar[], length: number): Array<number | undefined> {
  const values: Array<number | undefined> = Array.from({ length: bars.length }, () => undefined);

  if (bars.length < length) {
    return values;
  }

  const multiplier = 2 / (length + 1);
  let ema = bars.slice(0, length).reduce((sum, bar) => sum + bar.close, 0) / length;
  values[length - 1] = ema;

  for (let i = length; i < bars.length; i++) {
    ema = (bars[i].close - ema) * multiplier + ema;
    values[i] = ema;
  }

  return values;
}

function calculateSignalValues(
  points: Array<{ timestamp: number; value: number } | undefined>,
  length: number
): Array<number | undefined> {
  const values: Array<number | undefined> = Array.from({ length: points.length }, () => undefined);
  const definedPoints = points
    .map((point, index) => (point ? { ...point, index } : null))
    .filter((point): point is { timestamp: number; value: number; index: number } => point !== null);

  if (definedPoints.length < length) {
    return values;
  }

  const multiplier = 2 / (length + 1);
  let ema = definedPoints.slice(0, length).reduce((sum, point) => sum + point.value, 0) / length;
  values[definedPoints[length - 1].index] = ema;

  for (let i = length; i < definedPoints.length; i++) {
    ema = (definedPoints[i].value - ema) * multiplier + ema;
    values[definedPoints[i].index] = ema;
  }

  return values;
}

function calculateVolume(bars: Bar[]): IndicatorDataPoint[] {
  return bars
    .filter((bar) => bar.volume !== undefined)
    .map((bar) => ({
      time: bar.timestamp,
      value: bar.volume!,
    }));
}
