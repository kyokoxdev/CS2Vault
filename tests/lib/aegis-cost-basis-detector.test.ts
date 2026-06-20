import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        inventoryItem: {
            findFirst: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/db";
import { detectAegisCostBasisIntent } from "@/lib/aegis/actions/cost-basis-detector";

describe("detectAegisCostBasisIntent", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("ignores generic item mentions for acquired-price updates", async () => {
        const result = await detectAegisCostBasisIntent(
            "user-1",
            "Set @item[AK-47 | Redline] cost basis to 12.34",
        );

        expect(result).toBeNull();
        expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled();
    });

    it("detects an explicit active inventory item id", async () => {
        vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({
            id: "inventory-1",
            item: { name: "AK-47 | Redline" },
        } as never);

        const result = await detectAegisCostBasisIntent(
            "user-1",
            "Set inventory item inventory-1 acquired price to $12.34",
        );

        expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
            where: { id: "inventory-1", userId: "user-1", soldAt: null },
            select: { id: true, item: { select: { name: true } } },
        });
        expect(result).toEqual({
            inventoryItemId: "inventory-1",
            acquiredPrice: 12.34,
            itemName: "AK-47 | Redline",
        });
    });
});
