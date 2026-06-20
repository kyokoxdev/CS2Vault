import { prisma } from "@/lib/db";

export interface UpdateAcquiredPriceInput {
    inventoryItemId: string;
    acquiredPrice: number;
}

export async function updateAegisAcquiredPrice(userId: string, input: UpdateAcquiredPriceInput) {
    if (!Number.isFinite(input.acquiredPrice) || input.acquiredPrice < 0) {
        throw new Error("Acquired price must be a non-negative number.");
    }

    const existing = await prisma.inventoryItem.findFirst({
        where: {
            id: input.inventoryItemId,
            userId,
            soldAt: null,
        },
        include: {
            item: {
                select: {
                    id: true,
                    name: true,
                    marketHashName: true,
                },
            },
        },
    });

    if (!existing) {
        throw new Error("Portfolio item not found or is not editable.");
    }

    const updated = await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: { acquiredPrice: input.acquiredPrice },
        include: {
            item: {
                select: {
                    id: true,
                    name: true,
                    marketHashName: true,
                },
            },
        },
    });

    return {
        id: updated.id,
        itemId: updated.itemId,
        acquiredPrice: updated.acquiredPrice,
        previousAcquiredPrice: existing.acquiredPrice,
        item: updated.item,
    };
}
