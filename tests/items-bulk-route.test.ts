import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
    prisma: {
        item: {
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        itemGroup: {
            findMany: vi.fn(),
            createMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        watchlistGroup: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { POST } from "@/app/api/items/bulk/route";

const mockItemFindMany = vi.mocked(prisma.item.findMany);
const mockItemUpdate = vi.mocked(prisma.item.update);
const mockItemUpdateMany = vi.mocked(prisma.item.updateMany);
const mockItemGroupFindMany = vi.mocked(prisma.itemGroup.findMany);
const mockItemGroupCreateMany = vi.mocked(prisma.itemGroup.createMany);
const mockItemGroupDeleteMany = vi.mocked(prisma.itemGroup.deleteMany);
const mockWatchlistGroupFindMany = vi.mocked(prisma.watchlistGroup.findMany);
const mockRequireAuth = vi.mocked(requireAuth);

function makePostRequest(body: unknown): NextRequest {
    return new Request("http://localhost/api/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

describe("POST /api/items/bulk", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue({
            session: { user: { id: "user-1", steamId: "steam-1" } },
            error: null,
        } as never);
        mockItemGroupFindMany.mockResolvedValue([] as never);
        mockItemGroupCreateMany.mockResolvedValue({ count: 1 } as never);
        mockWatchlistGroupFindMany.mockResolvedValue([{ id: "group-1" }] as never);
    });

    it("restores notes and global group ids when bulk rewatching items", async () => {
        mockItemFindMany.mockResolvedValue([{ id: "item-1" }] as never);
        mockItemUpdate.mockResolvedValue({ id: "item-1", isWatched: true } as never);

        const response = await POST(makePostRequest({
            action: "rewatch",
            itemIds: ["item-1", "item-2"],
            restoreStates: [
                { itemId: "item-1", notes: "Restore me", groupIds: ["group-1"] },
                { itemId: "item-2", notes: "Already watched", groupIds: ["group-2"] },
            ],
        }));
        const body = await response.json();

        expect(body).toEqual({ success: true, affected: 1 });
        expect(mockItemFindMany).toHaveBeenCalledWith({
            where: { id: { in: ["item-1", "item-2"] }, isActive: true, isWatched: false },
            select: { id: true },
        });
        expect(mockItemUpdate).toHaveBeenCalledWith({
            where: { id: "item-1" },
            data: { isWatched: true, notes: "Restore me" },
        });
        expect(mockItemGroupCreateMany).toHaveBeenCalledWith({
            data: [{ itemId: "item-1", groupId: "group-1" }],
        });
    });

    it("globally unwatches items and clears group links", async () => {
        mockItemUpdateMany.mockResolvedValue({ count: 2 } as never);

        const response = await POST(makePostRequest({
            action: "unwatch",
            itemIds: ["item-1", "item-2"],
        }));
        const body = await response.json();

        expect(body).toEqual({ success: true, affected: 2 });
        expect(mockItemGroupDeleteMany).toHaveBeenCalledWith({
            where: { itemId: { in: ["item-1", "item-2"] } },
        });
        expect(mockItemUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ["item-1", "item-2"] }, isActive: true, isWatched: true },
            data: { isWatched: false, notes: null },
        });
    });

    it("clears all watched active items without requiring itemIds", async () => {
        mockItemFindMany.mockResolvedValue([{ id: "item-1" }, { id: "item-2" }] as never);
        mockItemUpdateMany.mockResolvedValue({ count: 2 } as never);

        const response = await POST(makePostRequest({
            action: "clearAll",
        }));
        const body = await response.json();

        expect(body).toEqual({ success: true, affected: 2 });
        expect(mockItemFindMany).toHaveBeenCalledWith({
            where: { isActive: true, isWatched: true },
            select: { id: true },
        });
        expect(mockItemGroupDeleteMany).toHaveBeenCalledWith({
            where: { itemId: { in: ["item-1", "item-2"] } },
        });
        expect(mockItemUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ["item-1", "item-2"] }, isActive: true, isWatched: true },
            data: { isWatched: false, notes: null },
        });
    });
});
