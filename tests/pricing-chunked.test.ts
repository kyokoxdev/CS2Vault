import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    appSettings: {
      findUnique: vi.fn(),
    },
    priceSnapshot: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/market/init", () => ({
  initializeMarketProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/market/registry", () => ({
  getMarketProvider: vi.fn(),
}));

vi.mock("@/lib/candles/aggregator", () => ({
  aggregateAllIntervals: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { getMarketProvider } from "@/lib/market/registry";
import { writePriceSnapshotsForItemsInChunks } from "@/lib/market/pricing";

const mockFindSettings = vi.mocked(prisma.appSettings.findUnique);
const mockFindSnapshots = vi.mocked(prisma.priceSnapshot.findMany);
const mockCreateMany = vi.mocked(prisma.priceSnapshot.createMany);
const mockGetMarketProvider = vi.mocked(getMarketProvider);

describe("writePriceSnapshotsForItemsInChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindSettings.mockResolvedValue({
      id: "singleton",
      activeMarketSource: "csfloat",
    } as never);
    mockFindSnapshots.mockResolvedValue([] as never);
    mockCreateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("emits progress after each chunk and aggregates totals", async () => {
    const fetchBulkPrices = vi.fn()
      .mockResolvedValueOnce(new Map([
        ["AK-47 | Redline", { price: 11, source: "csfloat", timestamp: new Date("2026-04-07T00:00:00.000Z") }],
      ]))
      .mockResolvedValueOnce(new Map([
        ["AWP | Asiimov", { price: 22, source: "csfloat", timestamp: new Date("2026-04-07T00:01:00.000Z") }],
      ]));

    mockGetMarketProvider.mockReturnValue({
      name: "csfloat",
      fetchBulkPrices,
    } as never);

    const progress = vi.fn();
    const result = await writePriceSnapshotsForItemsInChunks(new Map([
      ["AK-47 | Redline", "item-1"],
      ["AWP | Asiimov", "item-2"],
    ]), {
      chunkSize: 1,
      onProgress: progress,
      allowSteamLimit: false,
    });

    expect(result.pricedCount).toBe(2);
    expect(result.totalRequested).toBe(2);
    expect(fetchBulkPrices).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      completed: 1,
      total: 2,
      pricedCount: 1,
      batchRequested: 1,
      batchPriced: 1,
      provider: "csfloat",
    }));
    expect(progress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      completed: 2,
      total: 2,
      pricedCount: 2,
      batchRequested: 1,
      batchPriced: 1,
      provider: "csfloat",
    }));
  });
});
