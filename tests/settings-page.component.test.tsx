/** @vitest-environment jsdom */

import "./setup-component";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/settings/page";
import UiPreferencesProvider from "@/components/providers/UiPreferencesProvider";

vi.mock("@/components/ui/Select", () => ({
  Select: ({ id, value, onChange, options, className }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    className?: string;
  }) => (
    <select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

function renderPage() {
  return render(
    <UiPreferencesProvider>
      <SettingsPage />
    </UiPreferencesProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows exactly two theme options and no visible density or motion controls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeMarketSource: "csfloat",
        activeAIProvider: "gemini-flash",
        priceRefreshIntervalMin: 15,
        openAiApiKey: "",
        geminiApiKey: "",
        anthropicApiKey: "",
        openRouterApiKey: "",
        nineRouterApiKey: "",
        csfloatApiKey: "",
        csgotraderSubProvider: "csfloat",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const themeSelect = await screen.findByLabelText("Theme");
    const options = within(themeSelect).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.textContent)).toEqual(["Dark", "High Contrast"]);
    expect(screen.getByTestId("preferences-market-tape-toggle")).toBeChecked();
    expect(screen.queryByLabelText("Density")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Motion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ui-density-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ui-motion-select")).not.toBeInTheDocument();
  });

  it("updates persisted ui preferences when the market tape toggle changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeMarketSource: "csfloat",
        activeAIProvider: "gemini-flash",
        priceRefreshIntervalMin: 15,
        openAiApiKey: "",
        geminiApiKey: "",
        anthropicApiKey: "",
        openRouterApiKey: "",
        nineRouterApiKey: "",
        csfloatApiKey: "",
        csgotraderSubProvider: "csfloat",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const toggle = await screen.findByTestId("preferences-market-tape-toggle");
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).not.toBeChecked();
      expect(JSON.parse(localStorage.getItem("cs2vault-ui-preferences") ?? "null")).toEqual({
        theme: "dark",
        marketTapeVisible: false,
      });
    });
  });

  it("loads the browser refresh interval and shows the market cap refresh action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeMarketSource: "csfloat",
        activeAIProvider: "gemini-flash",
        priceRefreshIntervalMin: 15,
        openAiApiKey: "",
        geminiApiKey: "",
        anthropicApiKey: "",
        openRouterApiKey: "",
        nineRouterApiKey: "",
        csfloatApiKey: "",
        csgotraderSubProvider: "csfloat",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByLabelText("Browser Refresh Interval (Minutes)")).toHaveValue(15);
    expect(screen.getByRole("button", { name: "Market Cap Controls" })).toBeInTheDocument();
  });

  it("forces a manual market cap refresh from settings", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activeMarketSource: "csfloat",
          activeAIProvider: "gemini-flash",
          priceRefreshIntervalMin: 15,
          openAiApiKey: "",
          geminiApiKey: "",
          anthropicApiKey: "",
          openRouterApiKey: "",
          nineRouterApiKey: "",
          csfloatApiKey: "",
          csgotraderSubProvider: "csfloat",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            totalMarketCap: 5774762257,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const button = await screen.findByRole("button", { name: "Market Cap Controls" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/market/market-cap-sync", { method: "POST" });
    });

    expect(await screen.findByText("$5,774,762,257 refreshed successfully.")).toBeInTheDocument();
  });
});
