import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    priceSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { detectSignificantChanges } from "../src/lib/market/price-activity";

const mockFindMany = vi.mocked(prisma.priceSnapshot.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSnapshot(overrides: {
  id?: number;
  itemId: string;
  price: number;
  timestamp: Date;
  itemName: string;
}) {
  return {
    id: overrides.id ?? 1,
    itemId: overrides.itemId,
    price: overrides.price,
    volume: null,
    source: "steam",
    timestamp: overrides.timestamp,
    item: {
      id: overrides.itemId,
      name: overrides.itemName,
      marketHashName: overrides.itemName,
      isActive: true,
    },
  };
}

describe("detectSignificantChanges", () => {
  it("detects 10% increase with direction up", async () => {
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "AK-47 | Case Hardened",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 110,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "AK-47 | Case Hardened",
      }),
    ] as never);

    const results = await detectSignificantChanges();

    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe("item-1");
    expect(results[0].itemName).toBe("AK-47 | Case Hardened");
    expect(results[0].previousPrice).toBe(100);
    expect(results[0].currentPrice).toBe(110);
    expect(results[0].changePercent).toBeCloseTo(10, 1);
    expect(results[0].direction).toBe("up");
    expect(results[0].detectedAt).toBeInstanceOf(Date);
  });

  it("excludes 3% change below default 5% threshold", async () => {
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "AWP | Asiimov",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 103,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "AWP | Asiimov",
      }),
    ] as never);

    const results = await detectSignificantChanges();

    expect(results).toHaveLength(0);
  });

  it("includes 3% change with custom thresholdPercent of 2", async () => {
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "AWP | Asiimov",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 103,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "AWP | Asiimov",
      }),
    ] as never);

    const results = await detectSignificantChanges({ thresholdPercent: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].changePercent).toBeCloseTo(3, 1);
    expect(results[0].direction).toBe("up");
  });

  it("returns empty array when no snapshots exist", async () => {
    mockFindMany.mockResolvedValue([] as never);

    const results = await detectSignificantChanges();

    expect(results).toHaveLength(0);
    expect(results).toEqual([]);
  });

  it("excludes items with only a single snapshot", async () => {
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "M4A4 | Howl",
      }),
    ] as never);

    const results = await detectSignificantChanges();

    expect(results).toHaveLength(0);
  });

  it("detects price decrease with direction down", async () => {
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 200,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "Dragon Lore",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 170,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "Dragon Lore",
      }),
    ] as never);

    const results = await detectSignificantChanges();

    expect(results).toHaveLength(1);
    expect(results[0].changePercent).toBeCloseTo(-15, 1);
    expect(results[0].direction).toBe("down");
  });

  it("sorts results by absolute changePercent descending and respects limit", async () => {
    mockFindMany.mockResolvedValue([
      // Item A: 10% increase
      makeSnapshot({
        id: 1,
        itemId: "item-a",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "Item A",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-a",
        price: 110,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "Item A",
      }),
      // Item B: 20% decrease
      makeSnapshot({
        id: 3,
        itemId: "item-b",
        price: 100,
        timestamp: new Date("2026-02-26T10:00:00Z"),
        itemName: "Item B",
      }),
      makeSnapshot({
        id: 4,
        itemId: "item-b",
        price: 80,
        timestamp: new Date("2026-02-26T20:00:00Z"),
        itemName: "Item B",
      }),
    ] as never);

    const results = await detectSignificantChanges({ limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe("item-b");
    expect(Math.abs(results[0].changePercent)).toBeGreaterThan(10);
  });
});
