import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
    prisma: {
        item: {
            findUnique: vi.fn(),
            update: vi.fn(),
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
import { PATCH } from "@/app/api/items/[id]/route";

const mockItemFindUnique = vi.mocked(prisma.item.findUnique);
const mockItemUpdate = vi.mocked(prisma.item.update);
const mockItemGroupFindMany = vi.mocked(prisma.itemGroup.findMany);
const mockItemGroupCreateMany = vi.mocked(prisma.itemGroup.createMany);
const mockWatchlistGroupFindMany = vi.mocked(prisma.watchlistGroup.findMany);
const mockRequireAuth = vi.mocked(requireAuth);

function makePatchRequest(body: unknown): NextRequest {
    return new Request("http://localhost/api/items/item-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

describe("PATCH /api/items/[id]", () => {
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

    it("restores notes and global group ids when rewatching an item", async () => {
        mockItemFindUnique
            .mockResolvedValueOnce({ id: "item-1", notes: null } as never)
            .mockResolvedValueOnce({
                id: "item-1",
                category: "weapon",
                type: null,
                rarity: null,
                notes: "Keep tracking",
                isWatched: true,
                groups: [{ group: { id: "group-1", name: "Core", color: null } }],
            } as never);
        mockItemUpdate.mockResolvedValue({
            id: "item-1",
            category: "weapon",
            type: null,
            rarity: null,
            notes: "Keep tracking",
            isWatched: true,
            groups: [],
        } as never);

        const response = await PATCH(
            makePatchRequest({
                isWatched: true,
                notes: "Keep tracking",
                restoreGroupIds: ["group-1"],
            }),
            { params: Promise.resolve({ id: "item-1" }) },
        );
        const body = await response.json();

        expect(body.success).toBe(true);
        expect(mockItemUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "item-1" },
            data: { isWatched: true, notes: "Keep tracking" },
        }));
        expect(mockItemGroupCreateMany).toHaveBeenCalledWith({
            data: [{ itemId: "item-1", groupId: "group-1" }],
        });
        expect(body.data.groups).toEqual([{ id: "group-1", name: "Core", color: null }]);
    });
});
