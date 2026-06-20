import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        item: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db";
import { detectAegisWatchlistAction, maybeHandleAegisWatchlistAction } from "@/lib/ai/watchlist-actions";

const mockItemFindMany = vi.mocked(prisma.item.findMany);
const mockItemUpdate = vi.mocked(prisma.item.update);

describe("maybeHandleAegisWatchlistAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("ignores chat messages without explicit watchlist add intent", async () => {
        const result = await maybeHandleAegisWatchlistAction("What do you think about @item[AWP | Asiimov]?");

        expect(result).toBeNull();
        expect(mockItemFindMany).not.toHaveBeenCalled();
        expect(mockItemUpdate).not.toHaveBeenCalled();
    });

    it("adds an exact item mention to the global watchlist", async () => {
        mockItemFindMany.mockResolvedValue([
            {
                id: "item-1",
                name: "AWP | Asiimov",
                marketHashName: "AWP | Asiimov (Field-Tested)",
                isWatched: false,
            },
        ] as never);
        mockItemUpdate.mockResolvedValue({ id: "item-1", isWatched: true } as never);

        const result = await maybeHandleAegisWatchlistAction("Add @item[AWP | Asiimov (Field-Tested)] to the watchlist");

        expect(result).toEqual({
            status: "added",
            itemName: "AWP | Asiimov",
            message: "AWP | Asiimov was added to the global Watchlist.",
        });
        expect(mockItemUpdate).toHaveBeenCalledWith({
            where: { id: "item-1" },
            data: { isWatched: true },
        });
    });

    it("detects an add intent without mutating the global watchlist", async () => {
        mockItemFindMany.mockResolvedValue([
            {
                id: "item-1",
                name: "AWP | Asiimov",
                marketHashName: "AWP | Asiimov (Field-Tested)",
                isWatched: false,
            },
        ] as never);

        const result = await detectAegisWatchlistAction("Add @item[AWP | Asiimov (Field-Tested)] to the watchlist");

        expect(result).toEqual({
            status: "added",
            itemId: "item-1",
            itemName: "AWP | Asiimov",
            marketHashName: "AWP | Asiimov (Field-Tested)",
            message: "AWP | Asiimov was added to the global Watchlist.",
        });
        expect(mockItemUpdate).not.toHaveBeenCalled();
    });

    it("does not mutate an already watched item", async () => {
        mockItemFindMany.mockResolvedValue([
            {
                id: "item-1",
                name: "AK-47 | Redline",
                marketHashName: "AK-47 | Redline (Field-Tested)",
                isWatched: true,
            },
        ] as never);

        const result = await maybeHandleAegisWatchlistAction("Track @item[AK-47 | Redline (Field-Tested)]");

        expect(result?.status).toBe("already_watched");
        expect(mockItemUpdate).not.toHaveBeenCalled();
    });

    it("requires an exact item mention before mutating the global watchlist", async () => {
        const result = await maybeHandleAegisWatchlistAction("Add Asiimov to the watchlist");

        expect(result).toEqual({
            status: "not_found",
            message: "I can add an item to the global Watchlist when you include an exact @item[...] mention.",
        });
        expect(mockItemFindMany).not.toHaveBeenCalled();
        expect(mockItemUpdate).not.toHaveBeenCalled();
    });
});
