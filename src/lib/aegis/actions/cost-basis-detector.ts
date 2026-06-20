import { prisma } from "@/lib/db";

export interface AegisCostBasisIntent {
    inventoryItemId: string;
    acquiredPrice: number;
    itemName: string;
}

const costBasisIntentPattern = /\b(cost basis|acquired price|purchase price|bought(?:\s+it)?\s+for|paid)\b/i;
const priceAfterIntentPattern = /\b(?:cost basis|acquired price|purchase price|bought(?:\s+it)?\s+for|paid)\b[\s\S]{0,50}?\$?(\d+(?:\.\d{1,2})?)\b/i;
const explicitInventoryPattern = /\b(?:inventory|portfolio)\s+item\s+([a-z0-9_-]+)\b/i;
const attachedPortfolioItemIdPattern = /\[Attached portfolio item:[^\]]*\b(?:inventory|portfolio)\s+item\s+([a-z0-9_-]+)[^\]]*\]/i;

function extractRequestedPrice(message: string): number | null {
    const match = message.match(priceAfterIntentPattern);
    if (!match?.[1]) return null;

    const value = Number(match[1]);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function detectAegisCostBasisIntent(userId: string, message: string): Promise<AegisCostBasisIntent | null> {
    if (!costBasisIntentPattern.test(message)) {
        return null;
    }

    const acquiredPrice = extractRequestedPrice(message);
    if (acquiredPrice === null) {
        return null;
    }

    const explicitInventoryId = message.match(explicitInventoryPattern)?.[1]
        ?? message.match(attachedPortfolioItemIdPattern)?.[1];
    if (explicitInventoryId) {
        const inventoryItem = await prisma.inventoryItem.findFirst({
            where: { id: explicitInventoryId, userId, soldAt: null },
            select: { id: true, item: { select: { name: true } } },
        });
        if (inventoryItem) {
            return { inventoryItemId: inventoryItem.id, acquiredPrice, itemName: inventoryItem.item.name };
        }
    }

    return null;
}
