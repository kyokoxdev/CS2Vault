/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../setup-component";

const setAreaData = vi.fn();
const chartApplyOptions = vi.fn();
const fitContent = vi.fn();
const remove = vi.fn();

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: setAreaData })),
    applyOptions: chartApplyOptions,
    timeScale: () => ({ fitContent }),
    remove,
  })),
  AreaSeries: "AreaSeries",
  ColorType: { Solid: "solid" },
}));

import MarketCapChart from "@/components/charts/MarketCapChart";

const marketCapResponse = {
  success: true,
  data: {
    series: [
      { time: 1714800000, value: 4500000000, itemCount: 4000 },
      { time: 1714886400, value: 5100000000, itemCount: 4200 },
    ],
    count: 2,
    latest: {
      totalMarketCap: 5100000000,
      itemCount: 4200,
      timestamp: "2026-05-01T12:00:00Z",
    },
  },
};

describe("MarketCapChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(marketCapResponse),
    }) as unknown as typeof fetch;
  });

  it("renders the regular toolbar with market cap inline details and toggle", async () => {
    render(<MarketCapChart />);

    await waitFor(() => {
      expect(screen.getByText("CS2 Market Cap")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Regular mode" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Advanced mode" })).toBeInTheDocument();
    });

    // Regular mode shows market-cap-specific inline details: Change, ATH, Data Points
    expect(screen.getByText("Change")).toBeInTheDocument();
    expect(screen.getByText("ATH")).toBeInTheDocument();
    expect(screen.getByText("Data Points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset chart view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh chart data" })).toBeInTheDocument();
  });

  it("shows the advanced summary layout when toggled", async () => {
    render(<MarketCapChart />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Advanced mode" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    await waitFor(() => {
      expect(screen.getByText("Overlay")).toBeInTheDocument();
      expect(screen.getByText("SMA")).toBeInTheDocument();
      expect(screen.getByText("Reset view")).toBeInTheDocument();
      expect(screen.getByText("Refresh")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Market cap history chart" })).toBeInTheDocument();
    });
  });
});
