import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/market/pricing", () => ({
  writePriceSnapshotsForItems: vi.fn(),
  writePriceSnapshotsForItemsInChunks: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { writePriceSnapshotsForItemsInChunks } from "@/lib/market/pricing";
import { GET } from "@/app/api/portfolio/prices/route";

const mockFindMany = vi.mocked(prisma.inventoryItem.findMany);
const mockRequireAuth = vi.mocked(requireAuth);
const mockWritePriceSnapshotsForItemsInChunks = vi.mocked(writePriceSnapshotsForItemsInChunks);

describe("GET /api/portfolio/prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  it("streams server-side chunk progress", async () => {
    mockFindMany.mockResolvedValue([
      { item: { id: "item-1", marketHashName: "AK-47 | Redline" } },
      { item: { id: "item-2", marketHashName: "AWP | Asiimov" } },
    ] as never);

    mockWritePriceSnapshotsForItemsInChunks.mockImplementation(async (_map, options) => {
      await options?.onProgress?.({
        completed: 1,
        total: 2,
        pricedCount: 1,
        batchRequested: 1,
        batchPriced: 1,
        provider: "csfloat",
      });

      return {
        totalCandidates: 2,
        totalRequested: 2,
        pricedCount: 2,
        provider: "csfloat",
        attemptedProvider: "csfloat",
        skippedRecent: 0,
        fallbackAvailable: false,
      } as never;
    });

    const response = await GET(new Request("http://localhost/api/portfolio/prices") as never);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(bodyText).toContain("event: start");
    expect(bodyText).toContain("event: progress");
    expect(bodyText).toContain("event: complete");
    expect(bodyText).toContain('"completed":1');
    expect(bodyText).toContain('"pricedCount":2');
  });
});
