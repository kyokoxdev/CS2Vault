/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import "../setup-component";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";

const MOCK_SIGNALS = {
  success: true,
  data: {
    items: [
      {
        id: "sig-1",
        itemId: "item-1",
        marketHashName: "AK-47 | Redline",
        signalType: "pump",
        status: "active",
        confidence: 92,
        detectedAt: "2026-05-17T10:00:00Z",
        lastSeenAt: "2026-05-17T12:00:00Z",
        staleAt: null,
        priceCents: 1500,
        baselineCents: 1200,
        deltaCents: 300,
        reasons: [{ code: "price_above_scm_median", label: "Price Spike", signalType: "pump" }, "volume_increase"],
        freshness: "fresh",
        tier: "liquid",
        scmMedianCents: 1350,
        scmVolume: 42,
        csfloatFloorCents: 1400,
        csfloatSupply: 18,
      },
      {
        id: "sig-2",
        itemId: "item-2",
        marketHashName: "AWP | Dragon Lore",
        signalType: "accumulation",
        status: "active",
        confidence: 65,
        detectedAt: "2026-05-17T08:00:00Z",
        lastSeenAt: "2026-05-16T12:00:00Z",
        staleAt: "2026-05-16T12:00:00Z",
        priceCents: 500000,
        baselineCents: 480000,
        deltaCents: 20000,
        reasons: ["volume_3x_average"],
        freshness: "stale",
        tier: "low_supply_discontinued",
        scmMedianCents: null,
        scmVolume: null,
        csfloatFloorCents: null,
        csfloatSupply: null,
      },
    ],
    meta: {
      total: 2,
      hasMore: false,
      nextCursor: null,
      filters: { signalType: null, tier: null, freshness: null },
    },
  },
};

const MOCK_STATUS = {
  success: true,
  data: {
    initialized: true,
    killSwitch: false,
    circuitBreaker: { active: false, until: null, consecutiveFailures: 0 },
    queue: { pending: 5, running: 2, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMinutes: 12 },
    processed: null,
    skippedDueToBudget: null,
    remainingDue: 5,
    lastRunAt: "2026-05-17T11:30:00Z",
    nextRecommendedPingAt: "2026-05-17T12:00:00Z",
    lastError: null,
  },
};

const MOCK_EMPTY_QUEUE_STATUS = {
  success: true,
  data: {
    ...MOCK_STATUS.data,
    queue: { pending: 0, running: 0, backoff: 0, disabled: 0, oldestDueAt: null, oldestDueAgeMinutes: null },
    remainingDue: 0,
  },
};

const MOCK_PAUSED_STATUS = {
  success: true,
  data: {
    ...MOCK_STATUS.data,
    killSwitch: true,
  },
};

const MOCK_BACKOFF_STATUS = {
  success: true,
  data: {
    ...MOCK_STATUS.data,
    killSwitch: false,
    circuitBreaker: { active: true, until: "2026-05-17T13:00:00Z", consecutiveFailures: 3 },
  },
};

const EMPTY_SIGNALS = {
  success: true,
  data: {
    items: [],
    meta: { total: 0, hasMore: false, nextCursor: null, filters: { signalType: null, tier: null, freshness: null } },
  },
};

function createFetchMock(responses: Record<string, unknown>) {
  return vi.fn((url: string) => {
    for (const [path, data] of Object.entries(responses)) {
      if (url.includes(path)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, error: "Not found" }),
    });
  });
}

function createStatusToggleFetchMock(initialStatus: unknown, toggledStatus: unknown) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/intelligence/status") && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(toggledStatus),
      });
    }

    if (url.includes("/api/intelligence/signals")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_SIGNALS),
      });
    }

    if (url.includes("/api/intelligence/status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(initialStatus),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, error: "Not found" }),
    });
  });
}

function createSeedFetchMock(seedResponses: unknown[], statusResponse: unknown = MOCK_EMPTY_QUEUE_STATUS) {
  let seedIndex = 0;

  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/intelligence/seed") && init?.method === "POST") {
      const response = seedResponses[Math.min(seedIndex, seedResponses.length - 1)];
      seedIndex += 1;

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      });
    }

    if (url.includes("/api/intelligence/signals")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(EMPTY_SIGNALS),
      });
    }

    if (url.includes("/api/intelligence/status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(statusResponse),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, error: "Not found" }),
    });
  });
}

function createRefreshFetchMock(refreshResponse: unknown, statusResponse: unknown = MOCK_EMPTY_QUEUE_STATUS, signalsResponse: unknown = MOCK_SIGNALS) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/intelligence/refresh") && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(refreshResponse),
      });
    }

    if (url.includes("/api/intelligence/signals")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(signalsResponse),
      });
    }

    if (url.includes("/api/intelligence/status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(statusResponse),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, error: "Not found" }),
    });
  });
}

describe("IntelligenceDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading skeleton while data is being fetched", async () => {
    const neverResolving = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", neverResolving);

    render(<IntelligenceDashboard />);

    expect(screen.getByTestId("intelligence-dashboard")).toBeInTheDocument();
    const skeletons = document.querySelectorAll("div[class*='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders populated signals with badges, confidence, and item names", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    expect(screen.getByText("AWP | Dragon Lore")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getAllByText("Pump").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Accumulation").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Liquid").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Low-supply / discontinued").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("fresh").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("stale").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Price Spike")).toBeInTheDocument();
    expect(screen.getByText("volume_increase")).toBeInTheDocument();
    expect(screen.getByText("volume_3x_average")).toBeInTheDocument();
    expect(screen.getAllByText("Advisory signals only").length).toBeGreaterThanOrEqual(1);
  });

  it("renders SCM and CSFloat market data rows with values and placeholders", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    expect(screen.getAllByText("SCM Median").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("SCM Volume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CSFloat Floor").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CSFloat Supply").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("$13.50")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("$14.00")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();

    const dashValues = screen.getAllByText("—");
    expect(dashValues.length).toBeGreaterThanOrEqual(4);
  });

  it("opens marketplace links from signal cards", async () => {
    const signalsWithComplexName = {
      success: true,
      data: {
        ...MOCK_SIGNALS.data,
        items: [{ ...MOCK_SIGNALS.data.items[0], marketHashName: "AK-47 | Redline (Field-Tested)" }],
        meta: { ...MOCK_SIGNALS.data.meta, total: 1 },
      },
    };
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": signalsWithComplexName,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline (Field-Tested)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open marketplace links for AK-47 | Redline (Field-Tested)" }));

    const steamLink = screen.getByRole("menuitem", { name: "Open AK-47 | Redline (Field-Tested) on Steam Market" });
    const csfloatLink = screen.getByRole("menuitem", { name: "Open AK-47 | Redline (Field-Tested) on CSFloat" });

    expect(steamLink).toHaveAttribute("href", "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Field-Tested%29");
    expect(csfloatLink).toHaveAttribute("href", "https://csfloat.com/search?market_hash_name=AK-47%20%7C%20Redline%20%28Field-Tested%29");
    expect(steamLink).toHaveAttribute("target", "_blank");
    expect(csfloatLink).toHaveAttribute("target", "_blank");
    expect(steamLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(csfloatLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits marketplace actions when a signal has no market hash name", async () => {
    const signalsWithoutMarketName = {
      success: true,
      data: {
        ...MOCK_SIGNALS.data,
        items: [{ ...MOCK_SIGNALS.data.items[0], marketHashName: null }],
        meta: { ...MOCK_SIGNALS.data.meta, total: 1 },
      },
    };
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": signalsWithoutMarketName,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Unknown Item")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Open marketplace links/i })).not.toBeInTheDocument();
  });

  it("renders summary cards with signal counts", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Signals Detected")).toBeInTheDocument();
    });

    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("High Confidence")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Stale / Backlog")).toBeInTheDocument();
  });

  it("renders queue status panel with active state", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-status-panel")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a disabled seed button while queue items are currently running", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": EMPTY_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeDisabled();
  });

  it("leaves the seed button enabled when items are pending but none are running", async () => {
    const statusWithPendingOnly = {
      success: true,
      data: {
        ...MOCK_STATUS.data,
        queue: { ...MOCK_STATUS.data.queue, pending: 5, running: 0 },
      },
    };
    
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": EMPTY_SIGNALS,
      "/api/intelligence/status": statusWithPendingOnly,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
    });
  });

  it("seeds the catalog when the queue is empty and refreshes status", async () => {
    const fetchMock = createSeedFetchMock([
      {
        success: true,
        data: {
          seeded: 10,
          disabled: 1,
          skipped: 2,
          progress: { hasMore: false, nextCursor: null },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Seed intelligence queue" }));

    await waitFor(() => {
      expect(screen.getByText("Seeded 10 entries. Disabled 1. Skipped 2.")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/intelligence/seed", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cap: 100 }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("continues bounded seeding while more catalog entries are available", async () => {
    const fetchMock = createSeedFetchMock([
      {
        success: true,
        data: {
          seeded: 100,
          disabled: 0,
          skipped: 0,
          progress: { hasMore: true, nextCursor: 100 },
        },
      },
      {
        success: true,
        data: {
          seeded: 100,
          disabled: 0,
          skipped: 0,
          progress: { hasMore: true, nextCursor: 200 },
        },
      },
      {
        success: true,
        data: {
          seeded: 100,
          disabled: 0,
          skipped: 0,
          progress: { hasMore: true, nextCursor: 300 },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Seed intelligence queue" }));

    await waitFor(() => {
      expect(screen.getByText("Seeded 300 entries. More entries are available; click again to continue.")).toBeInTheDocument();
    });

    const seedCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("/api/intelligence/seed"));
    expect(seedCalls).toHaveLength(3);
    expect(seedCalls[1][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ cap: 100, cursor: 100 }) }));
    expect(seedCalls[2][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ cap: 100, cursor: 200 }) }));
  });

  it("shows a seed error and re-enables the button when seeding fails", async () => {
    const fetchMock = createSeedFetchMock([
      { success: false, error: "Catalog seeding failed" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Seed intelligence queue" }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-seed-error")).toHaveTextContent("Catalog seeding failed");
    });
    expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
  });

  it("does not start overlapping seed requests while a seed action is pending", async () => {
    let resolveSeed: (value: unknown) => void = () => undefined;
    const seedPromise = new Promise((resolve) => {
      resolveSeed = resolve;
    });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/api/intelligence/seed") && init?.method === "POST") {
        return seedPromise;
      }

      if (url.includes("/api/intelligence/signals")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_SIGNALS) });
      }

      if (url.includes("/api/intelligence/status")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_EMPTY_QUEUE_STATUS) });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false, error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Seed intelligence queue" })).toBeEnabled();
    });

    const seedButton = screen.getByRole("button", { name: "Seed intelligence queue" });
    fireEvent.click(seedButton);
    fireEvent.click(seedButton);

    const seedCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("/api/intelligence/seed"));
    expect(seedCalls).toHaveLength(1);

    resolveSeed({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { seeded: 1, disabled: 0, skipped: 0, progress: { hasMore: false, nextCursor: null } },
      }),
    });
  });

  it("refreshes stale signals and reloads status and signals", async () => {
    const activeNoRunningStatus = {
      success: true,
      data: {
        ...MOCK_STATUS.data,
        queue: { ...MOCK_STATUS.data.queue, running: 0 },
      },
    };
    const fetchMock = createRefreshFetchMock({
      success: true,
      data: {
        status: "success",
        promoted: 2,
        candidateSignals: 2,
        candidateQueueItems: 2,
        refreshedItemIds: ["item-1", "item-2"],
        processed: 2,
        claimed: 2,
        succeeded: 2,
        failed: 0,
        skippedDueToBudget: 0,
        remainingDue: 0,
        oldestDueAgeMinutes: null,
        circuitBreaker: { active: false, until: null },
        killSwitch: false,
        lastRunAt: "2026-05-17T12:00:00Z",
        nextRecommendedPingAt: "2026-05-17T12:30:00Z",
      },
    }, activeNoRunningStatus);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh stale signals" }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-refresh-summary")).toHaveTextContent("Promoted 2 stale signal rows. Processed 2.");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/intelligence/refresh", expect.objectContaining({ method: "POST" }));
    const signalCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("/api/intelligence/signals"));
    const statusCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("/api/intelligence/status"));
    expect(signalCalls).toHaveLength(2);
    expect(statusCalls).toHaveLength(2);
  });

  it("shows a refresh error and re-enables the button when refresh fails", async () => {
    const activeNoRunningStatus = {
      success: true,
      data: {
        ...MOCK_STATUS.data,
        queue: { ...MOCK_STATUS.data.queue, running: 0 },
      },
    };
    const fetchMock = createRefreshFetchMock({ success: false, error: "Intelligence refresh failed" }, activeNoRunningStatus);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh stale signals" }));

    await waitFor(() => {
      expect(screen.getByTestId("queue-refresh-error")).toHaveTextContent("Intelligence refresh failed");
    });
    expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeEnabled();
  });

  it("disables stale refresh while queue items are running", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeDisabled();
    });
  });

  it("disables stale refresh when queue processing is paused or in backoff", async () => {
    const pausedFetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_PAUSED_STATUS,
    });
    vi.stubGlobal("fetch", pausedFetchMock);

    const { unmount } = render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeDisabled();
    });

    unmount();

    const backoffFetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_BACKOFF_STATUS,
    });
    vi.stubGlobal("fetch", backoffFetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh stale signals" })).toBeDisabled();
    });
  });

  it("pauses queue processing from the status panel", async () => {
    const fetchMock = createStatusToggleFetchMock(MOCK_STATUS, MOCK_PAUSED_STATUS);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pause signal processing" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Pause signal processing" }));

    await waitFor(() => {
      expect(screen.getByText(/Kill switch is active/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/intelligence/status", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "pause" }),
    }));
  });

  it("resumes queue processing from the status panel", async () => {
    const fetchMock = createStatusToggleFetchMock(MOCK_PAUSED_STATUS, MOCK_STATUS);
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resume signal processing" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resume signal processing" }));

    await waitFor(() => {
      expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/intelligence/status", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "resume" }),
    }));
  });

  it("shows a mutation error when queue pause fails", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/api/intelligence/status") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false, error: "Pause failed" }),
        });
      }

      if (url.includes("/api/intelligence/signals")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_STATUS) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pause signal processing" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Pause signal processing" }));

    await waitFor(() => {
      expect(screen.getByText("Pause failed")).toBeInTheDocument();
    });
  });

  it("shows empty state when no signals are returned", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": EMPTY_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(screen.getByText("No signals detected yet")).toBeInTheDocument();
  });

  it("shows error banner with retry when fetch fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: "Failed to fetch intelligence signals" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_STATUS),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed to fetch intelligence signals/)).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("retries fetch when retry button is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: "Network error" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_STATUS),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_SIGNALS),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_STATUS),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });
  });

  it("shows stale warning when signals have stale freshness", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("stale-warning")).toBeInTheDocument();
    });

    expect(screen.getByText(/Some signals are stale or expired/)).toBeInTheDocument();
  });

  it("shows queue paused status when kill switch is active", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_PAUSED_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-status-panel")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Paused").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("kill-switch-warning")).toBeInTheDocument();
    expect(screen.getByText(/Kill switch is active/)).toBeInTheDocument();
  });

  it("shows circuit breaker backoff warning", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_BACKOFF_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("queue-status-panel")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Backoff").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("circuit-breaker-warning")).toBeInTheDocument();
  });

  it("applies signal type filter and refetches with query params", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText("Type");
    fireEvent.change(typeSelect, { target: { value: "pump" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const signalsCallUrl = fetchMock.mock.calls[2][0] as string;
    expect(signalsCallUrl).toContain("signalType=pump");
  });

  it("applies tier filter and refetches with query params", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    const tierSelect = screen.getByLabelText("Tier");
    fireEvent.change(tierSelect, { target: { value: "liquid" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const signalsCallUrl = fetchMock.mock.calls[2][0] as string;
    expect(signalsCallUrl).toContain("tier=liquid");
  });

  it("applies freshness filter and refetches with query params", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    const freshnessSelect = screen.getByLabelText("Freshness");
    fireEvent.change(freshnessSelect, { target: { value: "fresh" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const signalsCallUrl = fetchMock.mock.calls[2][0] as string;
    expect(signalsCallUrl).toContain("freshness=fresh");
  });

  it("clears all filters when Clear button is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_SIGNALS) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STATUS) });

    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText("Type");
    fireEvent.change(typeSelect, { target: { value: "pump" } });

    await waitFor(() => {
      expect(screen.getByText("Clear")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    const clearCallUrl = fetchMock.mock.calls[4][0] as string;
    expect(clearCallUrl).not.toContain("signalType=");
  });

  it("does not render trading or investment advice language", async () => {
    const fetchMock = createFetchMock({
      "/api/intelligence/signals": MOCK_SIGNALS,
      "/api/intelligence/status": MOCK_STATUS,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntelligenceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("AK-47 | Redline")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Advisory signals only").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/buy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sell/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invest/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();
  });
});
