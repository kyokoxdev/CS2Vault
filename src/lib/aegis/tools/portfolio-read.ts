import { prisma } from "@/lib/db";

export async function readAegisPortfolio(userId: string) {
    const items = await prisma.inventoryItem.findMany({
        where: {
            userId,
            soldAt: null,
        },
        orderBy: { acquiredAt: "desc" },
        include: {
            item: {
                select: {
                    id: true,
                    name: true,
                    marketHashName: true,
                    imageUrl: true,
                    category: true,
                    rarity: true,
                    exterior: true,
                },
            },
        },
    });

    const totalAcquired = items.reduce((sum, item) => sum + (item.acquiredPrice ?? 0), 0);

    return {
        count: items.length,
        totalAcquired,
        items: items.map((item) => ({
            id: item.id,
            assetId: item.assetId,
            acquiredAt: item.acquiredAt,
            acquiredPrice: item.acquiredPrice,
            floatValue: item.floatValue,
            paintSeed: item.paintSeed,
            item: item.item,
        })),
    };
}
