import { prisma } from "@/lib/db";
import { extractItemMention } from "@/lib/ai/item-mentions";
import type { MarketContext } from "@/types";

type WatchlistActionResult = NonNullable<MarketContext["watchlistAction"]>;

export interface AegisWatchlistActionIntent extends WatchlistActionResult {
    itemId?: string;
    marketHashName?: string;
}

const removalIntentPattern = /\b(remove|unwatch|delete|clear|stop)\b[\s\S]{0,80}\b(watchlist|watch list|track|tracking|watching)\b/i;
const addToWatchlistPattern = /\b(add|put|place|save)\b[\s\S]{0,100}\b(watchlist|watch list)\b|\b(watchlist|watch list)\b[\s\S]{0,100}\b(add|put|place|save)\b/i;
const trackMentionPattern = /\b(track|watch)\b[\s\S]{0,100}@item\[/i;

function hasWatchlistAddIntent(message: string): boolean {
    if (removalIntentPattern.test(message)) {
        return false;
    }

    return addToWatchlistPattern.test(message) || trackMentionPattern.test(message);
}

export async function detectAegisWatchlistAction(message: string): Promise<AegisWatchlistActionIntent | null> {
    if (!hasWatchlistAddIntent(message)) {
        return null;
    }

    const mention = extractItemMention(message);
    if (!mention) {
        return {
            status: "not_found",
            message: "I can add an item to the global Watchlist when you include an exact @item[...] mention.",
        };
    }

    const activeItems = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true, isWatched: true },
    });

    const normalizedMention = mention.toLowerCase();
    const item = activeItems.find((candidate) => {
        return candidate.id === mention
            || candidate.marketHashName === mention
            || candidate.name === mention
            || candidate.marketHashName.toLowerCase() === normalizedMention
            || candidate.name.toLowerCase() === normalizedMention;
    });

    if (!item) {
        return {
            status: "not_found",
            itemName: mention,
            message: `I couldn't find an active CS2Vault item matching ${mention}, so I did not change the global Watchlist.`,
        };
    }

    if (item.isWatched) {
        return {
            status: "already_watched",
            itemName: item.name,
            itemId: item.id,
            marketHashName: item.marketHashName,
            message: `${item.name} is already on the global Watchlist.`,
        };
    }

    return {
        status: "added",
        itemName: item.name,
        itemId: item.id,
        marketHashName: item.marketHashName,
        message: `${item.name} was added to the global Watchlist.`,
    };
}

export async function maybeHandleAegisWatchlistAction(message: string): Promise<WatchlistActionResult | null> {
    const intent = await detectAegisWatchlistAction(message);
    if (!intent) return null;

    if (intent.status !== "added" || !intent.itemId) {
        return {
            status: intent.status,
            itemName: intent.itemName,
            message: intent.message,
        };
    }

    await prisma.item.update({
        where: { id: intent.itemId },
        data: { isWatched: true },
    });

    return {
        status: "added",
        itemName: intent.itemName,
        message: intent.message,
    };
}
