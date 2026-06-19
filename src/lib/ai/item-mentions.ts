const ITEM_MENTION_PREFIX = "@item[";
const MAX_ITEM_MENTION_LENGTH = 200;

const AEGIS_ITEM_SELECTED_EVENT = "cs2vault:aegis-item-selected";

interface AegisSelectedItem {
    hashName: string;
    id?: string | null;
    name: string;
    imageUrl: string | null;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
}

function formatItemMention(hashName: string): string {
    return `${ITEM_MENTION_PREFIX}${hashName.trim()}]`;
}

function extractItemMention(query: string): string | null {
    const startIndex = query.indexOf(ITEM_MENTION_PREFIX);
    if (startIndex === -1) {
        return null;
    }

    const contentStart = startIndex + ITEM_MENTION_PREFIX.length;
    const endIndex = query.indexOf("]", contentStart);
    if (endIndex === -1) {
        return null;
    }

    const content = query.slice(contentStart, endIndex);
    if (content.includes("\n") || content.includes("\r")) {
        return null;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
        return null;
    }

    if (Array.from(trimmedContent).length > MAX_ITEM_MENTION_LENGTH) {
        return null;
    }

    return trimmedContent;
}

export type { AegisSelectedItem };
export { AEGIS_ITEM_SELECTED_EVENT, extractItemMention, formatItemMention, MAX_ITEM_MENTION_LENGTH };
