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
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";
import { POST } from "@/app/api/portfolio/prices/route";

const mockFindMany = vi.mocked(prisma.inventoryItem.findMany);
const mockRequireAuth = vi.mocked(requireAuth);
const mockWritePriceSnapshotsForItems = vi.mocked(writePriceSnapshotsForItems);

describe("POST /api/portfolio/prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  it("refreshes the requested batch of portfolio items", async () => {
    mockFindMany.mockResolvedValue([
      { item: { id: "item-1", marketHashName: "AK-47 | Redline" } },
      { item: { id: "item-2", marketHashName: "AWP | Asiimov" } },
    ] as never);
    mockWritePriceSnapshotsForItems.mockResolvedValue({
      totalCandidates: 2,
      totalRequested: 2,
      pricedCount: 2,
      provider: "csfloat",
      attemptedProvider: "csfloat",
      skippedRecent: 0,
      limitedTo: undefined,
      fallbackAvailable: false,
    } as never);

    const request = new Request("http://localhost/api/portfolio/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: ["item-1", "item-2"] }),
    }) as never;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        soldAt: null,
        itemId: { in: ["item-1", "item-2"] },
      }),
    }));
    expect(mockWritePriceSnapshotsForItems).toHaveBeenCalledWith(
      new Map([
        ["AK-47 | Redline", "item-1"],
        ["AWP | Asiimov", "item-2"],
      ]),
      expect.objectContaining({
        allowSteamLimit: true,
        allowFallback: false,
      })
    );
    expect(payload.data.pricedCount).toBe(2);
    expect(payload.data.priceCoverage.total).toBe(2);
  });

  it("rejects invalid portfolio refresh payloads", async () => {
    const request = new Request("http://localhost/api/portfolio/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [""] }),
    }) as never;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockWritePriceSnapshotsForItems).not.toHaveBeenCalled();
  });

  it("treats an empty item batch as a no-op", async () => {
    const request = new Request("http://localhost/api/portfolio/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: [] }),
    }) as never;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.pricedCount).toBe(0);
    expect(payload.data.priceCoverage.total).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockWritePriceSnapshotsForItems).not.toHaveBeenCalled();
  });

});
