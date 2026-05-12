import { describe, expect, it } from "vitest";

import { calculateIndicator } from "@/lib/indicators/indicator-service";
import type { ChartCandlePoint } from "@/components/charts/chart-utils";

function buildCandles(count: number): ChartCandlePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;

    return {
      time: 1000 + index * 1000,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 100 + index * 10,
    };
  });
}

describe("calculateIndicator", () => {
  it("calculates multi-line overlay indicators", () => {
    const candles = buildCandles(30);

    const bollinger = calculateIndicator("bollinger", candles, { length: 20, stdDev: 2 });

    expect(bollinger).toHaveLength(11);
    expect(bollinger[0].values).toHaveLength(3);
  });

  it("calculates oscillator indicators with multiple output lines", () => {
    const candles = buildCandles(50);

    const macd = calculateIndicator("macd", candles, { fast: 12, slow: 26, signal: 9 });
    const stochastic = calculateIndicator("stochastic", candles, { k: 14, d: 3 });

    expect(macd.length).toBeGreaterThan(0);
    expect(macd[0].values).toHaveLength(3);
    expect(stochastic.length).toBeGreaterThan(0);
    expect(stochastic[0].values).toHaveLength(2);
  });

  it("calculates VWAP from candle volume", () => {
    const candles = buildCandles(5);

    const vwap = calculateIndicator("vwap", candles);

    expect(vwap).toHaveLength(5);
    expect(vwap[0].value).toBeGreaterThan(0);
  });
});
