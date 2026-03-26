/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../setup-component";

let lineSeriesFactoryCount = 0;

const setCandleData = vi.fn();
const setLineData = vi.fn();
const setShortMaData = vi.fn();
const setLongMaData = vi.fn();
const setVolumeData = vi.fn();
const applyCandleOptions = vi.fn();
const applyLineOptions = vi.fn();
const applyShortMaOptions = vi.fn();
const applyLongMaOptions = vi.fn();
const applyVolumeOptions = vi.fn();
const fitContent = vi.fn();
const chartApplyOptions = vi.fn();
const remove = vi.fn();
const volumeScaleApplyOptions = vi.fn();
const rightScaleApplyOptions = vi.fn();

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn((definition: unknown) => {
      if (definition === "CandlestickSeries") {
        return { setData: setCandleData, applyOptions: applyCandleOptions };
      }
      if (definition === "HistogramSeries") {
        return { setData: setVolumeData, applyOptions: applyVolumeOptions };
      }

      if (lineSeriesFactoryCount === 0) {
        lineSeriesFactoryCount += 1;
        return { setData: setLineData, applyOptions: applyLineOptions };
      }
      if (lineSeriesFactoryCount === 1) {
        lineSeriesFactoryCount += 1;
        return { setData: setShortMaData, applyOptions: applyShortMaOptions };
      }

      lineSeriesFactoryCount += 1;
      return { setData: setLongMaData, applyOptions: applyLongMaOptions };
    }),
    applyOptions: chartApplyOptions,
    timeScale: () => ({ fitContent }),
    priceScale: (id: string) => ({
      applyOptions: id === "volume" ? volumeScaleApplyOptions : rightScaleApplyOptions,
    }),
    remove,
  })),
  CandlestickSeries: "CandlestickSeries",
  HistogramSeries: "HistogramSeries",
  LineSeries: "LineSeries",
  ColorType: { Solid: "solid" },
}));

import CandlestickChart from "@/components/charts/CandlestickChart";

const chartResponse = {
  success: true,
  data: {
    candlesticks: [
      { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 2000, open: 11, high: 14, low: 10, close: 13, volume: 150 },
      { time: 3000, open: 13, high: 15, low: 12, close: 14, volume: 180 },
      { time: 4000, open: 14, high: 16, low: 13, close: 15, volume: 220 },
      { time: 5000, open: 15, high: 17, low: 14, close: 16, volume: 250 },
      { time: 6000, open: 16, high: 18, low: 15, close: 17, volume: 300 },
      { time: 7000, open: 17, high: 19, low: 16, close: 18, volume: 360 },
    ],
    latestPrice: 18,
    latestTimestamp: "2026-03-26T12:00:00Z",
    latestSource: "steam",
  },
};

describe("CandlestickChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lineSeriesFactoryCount = 0;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(chartResponse),
    }) as unknown as typeof fetch;
  });

  it("renders chart controls and publishes the latest market snapshot", async () => {
    const onMarketSnapshotChange = vi.fn();

    render(
      <CandlestickChart
        itemId="item-123"
        itemName="AK-47 | Redline"
        onMarketSnapshotChange={onMarketSnapshotChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Candles" })).toBeInTheDocument();
      expect(screen.getByText("MA 7")).toBeInTheDocument();
      expect(screen.getByText("Average volume")).toBeInTheDocument();
    });

    expect(onMarketSnapshotChange).toHaveBeenLastCalledWith({
      price: 18,
      timestamp: "2026-03-26T12:00:00Z",
      source: "steam",
      interval: "1d",
    });
    expect(setCandleData).toHaveBeenCalled();
    expect(setVolumeData).toHaveBeenCalled();
  });

  it("uses cached timeframe data when switching back to an already loaded range", async () => {
    render(<CandlestickChart itemId="item-123" itemName="AK-47 | Redline" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "1H" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "1D" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("toggles chart mode and overlays without refetching", async () => {
    render(<CandlestickChart itemId="item-123" itemName="AK-47 | Redline" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(fitContent).toHaveBeenCalledTimes(1);
    });

    const fitCallsBeforeToggle = fitContent.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    fireEvent.click(screen.getByRole("button", { name: "Volume" }));
    fireEvent.click(screen.getByRole("button", { name: "MA 21" }));

    await waitFor(() => {
      expect(applyLineOptions).toHaveBeenCalledWith({ visible: true });
      expect(applyCandleOptions).toHaveBeenCalledWith({ visible: false });
      expect(applyVolumeOptions).toHaveBeenCalled();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fitContent.mock.calls.length).toBe(fitCallsBeforeToggle);
  });

  it("refreshes chart state when the item id changes", async () => {
    const onMarketSnapshotChange = vi.fn();
    const { rerender } = render(
      <CandlestickChart
        itemId="item-123"
        itemName="AK-47 | Redline"
        onMarketSnapshotChange={onMarketSnapshotChange}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <CandlestickChart
        itemId="item-456"
        itemName="M4A4 | Howl"
        onMarketSnapshotChange={onMarketSnapshotChange}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText("M4A4 | Howl")).toBeInTheDocument();
    });

    expect(onMarketSnapshotChange).toHaveBeenLastCalledWith({
      price: 18,
      timestamp: "2026-03-26T12:00:00Z",
      source: "steam",
      interval: "1d",
    });
  });
});
