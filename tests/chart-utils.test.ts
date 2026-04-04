import { describe, expect, it } from "vitest";
import {
  calculateChartStats,
  calculateSimpleMovingAverage,
  toLineSeriesData,
} from "../src/components/charts/chart-utils";

const sampleCandles = [
  { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 200 },
  { time: 3, open: 12, high: 15, low: 11, close: 14, volume: 300 },
  { time: 4, open: 14, high: 16, low: 13, close: 15, volume: 400 },
  { time: 5, open: 15, high: 17, low: 14, close: 16, volume: 500 },
  { time: 6, open: 16, high: 18, low: 15, close: 17, volume: 600 },
  { time: 7, open: 17, high: 19, low: 16, close: 18, volume: 700 },
];

describe("chart-utils", () => {
  it("maps candles into line-series close values", () => {
    expect(toLineSeriesData(sampleCandles)).toEqual([
      { time: 1, value: 11 },
      { time: 2, value: 12 },
      { time: 3, value: 14 },
      { time: 4, value: 15 },
      { time: 5, value: 16 },
      { time: 6, value: 17 },
      { time: 7, value: 18 },
    ]);
  });

  it("calculates moving averages only after the full period exists", () => {
    expect(calculateSimpleMovingAverage(sampleCandles, 3)).toEqual([
      { time: 3, value: 12.333333333333334 },
      { time: 4, value: 13.666666666666666 },
      { time: 5, value: 15 },
      { time: 6, value: 16 },
      { time: 7, value: 17 },
    ]);
  });

  it("summarizes chart stats from the candle set", () => {
    expect(calculateChartStats(sampleCandles)).toEqual({
      startPrice: 10,
      endPrice: 18,
      delta: 8,
      changePercent: 80,
      high: 19,
      low: 9,
      candleCount: 7,
      trend: "up",
    });
  });

  it("returns null or empty output for insufficient candle input", () => {
    expect(calculateChartStats([])).toBeNull();
    expect(calculateSimpleMovingAverage(sampleCandles.slice(0, 2), 7)).toEqual([]);
  });
});
