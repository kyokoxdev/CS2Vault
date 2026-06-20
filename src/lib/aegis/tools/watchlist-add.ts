import { prisma } from "@/lib/db";

export interface AddAegisWatchlistItemInput {
    itemId?: string;
    marketHashName?: string;
}

export async function addAegisWatchlistItem(input: AddAegisWatchlistItemInput) {
    const item = await prisma.item.findFirst({
        where: {
            isActive: true,
            OR: [
                ...(input.itemId ? [{ id: input.itemId }] : []),
                ...(input.marketHashName ? [{ marketHashName: { equals: input.marketHashName } }] : []),
            ],
        },
    });

    if (!item) {
        throw new Error("Watchlist item not found.");
    }

    if (item.isWatched) {
        return {
            id: item.id,
            marketHashName: item.marketHashName,
            name: item.name,
            alreadyWatched: true,
        };
    }

    const updated = await prisma.item.update({
        where: { id: item.id },
        data: { isWatched: true },
    });

    return {
        id: updated.id,
        marketHashName: updated.marketHashName,
        name: updated.name,
        alreadyWatched: false,
    };
}
