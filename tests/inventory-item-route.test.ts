import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
    prisma: {
        inventoryItem: {
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { DELETE, PATCH } from "@/app/api/inventory/[id]/route";

function toNextRequest(request: Request): NextRequest {
    return request as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: "inventory-1" }) };

describe("/api/inventory/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            session: { user: { id: "user-1", steamId: "123" } },
            error: null,
        } as never);
    });

    it("returns 404 when patching another user's inventory item", async () => {
        vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValueOnce({
            id: "inventory-1",
            userId: "user-2",
            acquiredPrice: null,
            soldPrice: null,
            soldAt: null,
        } as never);

        const response = await PATCH(toNextRequest(new Request("http://localhost/api/inventory/inventory-1", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acquiredPrice: 12.34 }),
        })), params);

        expect(response.status).toBe(404);
        expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it("updates an owned inventory item", async () => {
        vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValueOnce({
            id: "inventory-1",
            userId: "user-1",
            acquiredPrice: null,
            soldPrice: null,
            soldAt: null,
        } as never);
        vi.mocked(prisma.inventoryItem.update).mockResolvedValueOnce({ id: "inventory-1" } as never);

        const response = await PATCH(toNextRequest(new Request("http://localhost/api/inventory/inventory-1", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acquiredPrice: 12.34 }),
        })), params);

        expect(response.status).toBe(200);
        expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "inventory-1" },
        }));
    });

    it("returns 404 when deleting another user's inventory item", async () => {
        vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValueOnce({
            id: "inventory-1",
            userId: "user-2",
        } as never);

        const response = await DELETE(toNextRequest(new Request("http://localhost/api/inventory/inventory-1", {
            method: "DELETE",
        })), params);

        expect(response.status).toBe(404);
        expect(prisma.inventoryItem.delete).not.toHaveBeenCalled();
    });
});
