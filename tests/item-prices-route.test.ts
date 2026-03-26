import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
    },
    candlestick: {
      findMany: vi.fn(),
    },
    priceSnapshot: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { GET } from "@/app/api/items/[id]/prices/route";

const mockFindItem = vi.mocked(prisma.item.findUnique);
const mockFindCandles = vi.mocked(prisma.candlestick.findMany);
const mockFindSnapshot = vi.mocked(prisma.priceSnapshot.findFirst);

describe("GET /api/items/[id]/prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the newest limited candle window in ascending chart order", async () => {
    mockFindItem.mockResolvedValue({
      id: "item-123",
      name: "AK-47 | Redline",
      marketHashName: "AK-47 | Redline (Field-Tested)",
    } as never);

    mockFindCandles.mockResolvedValue([
      {
        timestamp: new Date("2026-03-26T03:00:00.000Z"),
        open: 13,
        high: 15,
        low: 12,
        close: 14,
        volume: 300,
      },
      {
        timestamp: new Date("2026-03-26T02:00:00.000Z"),
        open: 12,
        high: 14,
        low: 11,
        close: 13,
        volume: 200,
      },
      {
        timestamp: new Date("2026-03-26T01:00:00.000Z"),
        open: 11,
        high: 13,
        low: 10,
        close: 12,
        volume: 100,
      },
    ] as never);

    mockFindSnapshot.mockResolvedValue({
      price: 14,
      timestamp: new Date("2026-03-26T03:15:00.000Z"),
      source: "steam",
    } as never);

    const request = {
      nextUrl: new URL("http://localhost/api/items/item-123/prices?interval=1d&limit=3"),
    } as never;

    const response = await GET(request, {
      params: Promise.resolve({ id: "item-123" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindCandles).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { timestamp: "desc" },
        take: 3,
      })
    );
    expect(payload.data.candlesticks).toEqual([
      { time: 1774486800, open: 11, high: 13, low: 10, close: 12, volume: 100 },
      { time: 1774490400, open: 12, high: 14, low: 11, close: 13, volume: 200 },
      { time: 1774494000, open: 13, high: 15, low: 12, close: 14, volume: 300 },
    ]);
    expect(payload.data.latestSource).toBe("steam");
  });
});
