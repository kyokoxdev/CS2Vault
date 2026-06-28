import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/market/pricing", () => ({
  writePriceSnapshotsForItems: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { writePriceSnapshotsForItems } from "@/lib/market/pricing";
import { POST } from "@/app/api/watchlist/prices/route";

const mockFindMany = vi.mocked(prisma.item.findMany);
const mockRequireAuth = vi.mocked(requireAuth);
const mockWritePriceSnapshotsForItems = vi.mocked(writePriceSnapshotsForItems);

describe("POST /api/watchlist/prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  it("refreshes watched item prices", async () => {
    mockFindMany.mockResolvedValue([
      { id: "item-1", marketHashName: "AK-47 | Redline" },
      { id: "item-2", marketHashName: "AWP | Asiimov" },
    ] as never);
    mockWritePriceSnapshotsForItems.mockResolvedValue({
      totalCandidates: 2,
      totalRequested: 2,
      pricedCount: 2,
      provider: "csfloat",
      attemptedProvider: "csfloat",
      skippedRecent: 0,
      fallbackAvailable: false,
    } as never);

    const request = {
      nextUrl: new URL("http://localhost/api/watchlist/prices"),
    } as never;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, isWatched: true },
    }));
    expect(mockWritePriceSnapshotsForItems).toHaveBeenCalledWith(
      new Map([
        ["AK-47 | Redline", "item-1"],
        ["AWP | Asiimov", "item-2"],
      ]),
      expect.objectContaining({
        allowSteamLimit: true,
        allowFallback: false,
        fetchSteamVolume: true,
      })
    );
    expect(payload.success).toBe(true);
    expect(payload.data.itemCount).toBe(2);
    expect(payload.data.priceCoverage.total).toBe(2);
  });

  it("passes steam fallback through to the pricing writer", async () => {
    mockFindMany.mockResolvedValue([
      { id: "item-1", marketHashName: "AK-47 | Redline" },
    ] as never);
    mockWritePriceSnapshotsForItems.mockResolvedValue({
      totalCandidates: 1,
      totalRequested: 1,
      pricedCount: 1,
      provider: "steam",
      attemptedProvider: "steam",
      skippedRecent: 0,
      fallbackAvailable: false,
    } as never);

    const request = {
      nextUrl: new URL("http://localhost/api/watchlist/prices?fallback=steam"),
    } as never;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockWritePriceSnapshotsForItems).toHaveBeenCalledWith(
      expect.any(Map),
      expect.objectContaining({
        allowFallback: true,
        overrideSource: "steam",
      })
    );
  });

  it("returns the watchlist refresh error when pricing throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mockFindMany.mockResolvedValue([
      { id: "item-1", marketHashName: "AK-47 | Redline" },
    ] as never);
    mockWritePriceSnapshotsForItems.mockRejectedValue(new Error("database unavailable"));

    const request = {
      nextUrl: new URL("http://localhost/api/watchlist/prices"),
    } as never;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ success: false, error: "Failed to refresh watchlist prices" });
    expect(consoleError).toHaveBeenCalledWith("[API /watchlist/prices POST]", expect.any(Error));

    consoleError.mockRestore();
  });
});
