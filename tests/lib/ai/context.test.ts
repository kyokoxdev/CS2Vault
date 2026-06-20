import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMarketContext } from "@/lib/ai/context";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
    prisma: {
        item: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
        },
        appSettings: {
            findUnique: vi.fn(),
        },
        marketCapSnapshot: {
            findFirst: vi.fn(),
        },
        syncLog: {
            findFirst: vi.fn(),
        },
        priceSnapshot: {
            findMany: vi.fn(),
        },
        candlestick: {
            findMany: vi.fn(),
        },
        inventoryItem: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/market/source", () => ({
    resolveMarketSource: vi.fn(() => "steam"),
}));

vi.mock("@/lib/news/rss-feeds", () => ({
    fetchRssFeeds: vi.fn(async () => []),
}));

const trackedItems = [
    {
        id: "item-redline-ft",
        name: "AK-47 Redline",
        marketHashName: "AK-47 | Redline (Field-Tested)",
    },
    {
        id: "item-redline-mw",
        name: "AK-47 Redline",
        marketHashName: "AK-47 | Redline (Minimal Wear)",
    },
    {
        id: "item-dragon-lore",
        name: "AWP Dragon Lore",
        marketHashName: "AWP | Dragon Lore (Factory New)",
    },
];

function createHistory(itemId: string) {
    return [
        {
            itemId,
            price: itemId === "item-redline-ft" ? 28.5 : itemId === "item-redline-mw" ? 42 : 1800,
            timestamp: new Date("2026-06-10T00:00:00.000Z"),
        },
        {
            itemId,
            price: itemId === "item-redline-ft" ? 30 : itemId === "item-redline-mw" ? 45 : 1825,
            timestamp: new Date("2026-06-11T00:00:00.000Z"),
        },
    ];
}

describe("buildMarketContext targeted item resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(prisma.item.count).mockResolvedValue(0 as never);
        vi.mocked(prisma.appSettings.findUnique).mockResolvedValue({ activeMarketSource: "steam" } as never);
        vi.mocked(prisma.marketCapSnapshot.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.syncLog.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.candlestick.findMany).mockResolvedValue([] as never);

        vi.mocked(prisma.item.findMany).mockImplementation(async (args) => {
            if (args && typeof args === "object" && "include" in args) {
                if (args.where && "isWatched" in args.where) {
                    return [] as never;
                }

                return [] as never;
            }

            return trackedItems as never;
        });

        vi.mocked(prisma.item.findUnique).mockImplementation(async ({ where }) => {
            const item = trackedItems.find((entry) => entry.id === where.id);

            if (!item) {
                return null as never;
            }

            return {
                rarity: item.id === "item-dragon-lore" ? "Covert" : "Classified",
                exterior: item.marketHashName.includes("Factory New") ? "Factory New" : item.marketHashName.includes("Minimal Wear") ? "Minimal Wear" : "Field-Tested",
                category: "weapon",
            } as never;
        });

        vi.mocked(prisma.priceSnapshot.findMany).mockImplementation(async ({ where }) => createHistory(where.itemId) as never);
    });

    it("resolves an exact @item mention by market hash name before fuzzy fallback", async () => {
        const context = await buildMarketContext(undefined, "Compare @item[AK-47 | Redline (Field-Tested)] against the rest of the market");

        expect(context.targetedItemData?.name).toBe("AK-47 Redline");
        expect(prisma.priceSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                itemId: "item-redline-ft",
                source: { not: "steam-intelligence" },
            },
        }));
    });

    it("resolves an exact @item mention by item id before fuzzy fallback", async () => {
        const context = await buildMarketContext(undefined, "Analyze @item[item-redline-mw] for me");

        expect(context.targetedItemData?.name).toBe("AK-47 Redline");
        expect(prisma.priceSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                itemId: "item-redline-mw",
                source: { not: "steam-intelligence" },
            },
        }));
    });

    it("resolves an exact @item mention by item name before fuzzy fallback", async () => {
        const context = await buildMarketContext(undefined, "Review @item[AWP Dragon Lore] with price context");

        expect(context.targetedItemData?.name).toBe("AWP Dragon Lore");
        expect(prisma.priceSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                itemId: "item-dragon-lore",
                source: { not: "steam-intelligence" },
            },
        }));
    });

    it("falls back to market hash name comparisons when no exact mention exists", async () => {
        const context = await buildMarketContext(undefined, "How does ak47 redline field tested look right now?");

        expect(context.targetedItemData?.name).toBe("AK-47 Redline");
        expect(prisma.priceSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                itemId: "item-redline-ft",
                source: { not: "steam-intelligence" },
            },
        }));
    });
});
