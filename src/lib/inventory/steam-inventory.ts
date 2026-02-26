/**
 * Steam Inventory Fetcher
 *
 * Fetches a user's CS2 inventory from Steam's public/community endpoint.
 * Endpoint: GET https://steamcommunity.com/inventory/{steamId}/730/2
 *
 * Returns structured inventory items with parsed asset data.
 * Rate-limited through steamQueue.
 */

import { steamQueue } from "@/lib/api-queue";
import { detectRarityFromType, detectTypeFromTagsOrName, normalizeRarity } from "@/lib/market/rarity";

const CS2_APP_ID = "730";
const CS2_CONTEXT_ID = "2";
const DEFAULT_PAGE_SIZE = 1000;
const FALLBACK_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 2000;

function clampPageSize(size: number): number {
    return Math.max(1, Math.min(MAX_PAGE_SIZE, size));
}

function getPageSizeFromEnv(): number {
    const raw = process.env.STEAM_INVENTORY_PAGE_SIZE;
    if (!raw) return DEFAULT_PAGE_SIZE;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
    return clampPageSize(parsed);
}

function buildInventoryUrl(
    steamId: string,
    count: number,
    lastAssetId?: string
): URL {
    const url = new URL(
        `https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/${CS2_CONTEXT_ID}`
    );
    url.searchParams.set("l", "english");
    url.searchParams.set("count", count.toString());
    if (lastAssetId) {
        url.searchParams.set("start_assetid", lastAssetId);
    }
    return url;
}

export interface SteamInventoryAsset {
    appid: number;
    contextid: string;
    assetid: string;
    classid: string;
    instanceid: string;
    amount: string;
}

export interface SteamInventoryDescription {
    appid: number;
    classid: string;
    instanceid: string;
    name: string;
    market_hash_name: string;
    market_name: string;
    icon_url: string;
    tradable: number;
    marketable: number;
    type: string; // e.g. "Covert Rifle", "Base Grade Container"
    tags?: Array<{
        category: string;
        internal_name: string;
        localized_category_name: string;
        localized_tag_name: string;
        color?: string;
    }>;
    commodity?: number;
    fraudwarnings?: string[];
    market_fee_app?: string;
    market_actions?: Array<{ name: string; link: string }>; // present on marketable items
    descriptions?: Array<{ value: string; color?: string }>; // text descriptions
}

export interface ParsedInventoryItem {
    assetId: string;
    marketHashName: string;
    name: string;
    imageUrl: string;
    tradable: boolean;
    marketable: boolean;
    type: string;
    itemType: string | null;
    rarity: string | null;
    exterior: string | null;
    weapon: string | null;
    skin: string | null;
    category: string;
}

/**
 * Fetch a user's full CS2 inventory from Steam.
 * Handles pagination (Steam returns max ~5000 items per request).
 */
export async function fetchSteamInventory(
    steamId: string
): Promise<ParsedInventoryItem[]> {
    const allItems: ParsedInventoryItem[] = [];
    let lastAssetId: string | undefined;
    let hasMore = true;
    let pageSize = getPageSizeFromEnv();
    let usedFallback = false;

    while (hasMore) {
        const result = await steamQueue.enqueue(async () => {
            const attemptFetch = async (count: number) => {
                const url = buildInventoryUrl(steamId, count, lastAssetId);
                return fetch(url.toString());
            };

            let res = await attemptFetch(pageSize);
            if (res.status === 400 && pageSize > FALLBACK_PAGE_SIZE) {
                const fallbackRes = await attemptFetch(FALLBACK_PAGE_SIZE);
                if (fallbackRes.ok) {
                    if (!usedFallback) {
                        console.warn(
                            `[Steam] Inventory 400 with count=${pageSize}; retrying with count=${FALLBACK_PAGE_SIZE}.`
                        );
                    }
                    pageSize = FALLBACK_PAGE_SIZE;
                    usedFallback = true;
                    res = fallbackRes;
                } else {
                    res = fallbackRes;
                }
            }

            if (res.status === 403) {
                throw new Error(
                    "Steam inventory is private. Please set your inventory to public in Steam settings."
                );
            }
            if (res.status === 429) {
                throw new Error("Steam rate limited. Please try again in a few minutes.");
            }
            if (!res.ok) {
                throw new Error(`Steam inventory API error: ${res.status} ${res.statusText}`);
            }
            return res.json();
        });

        if (!result || !result.assets || !result.descriptions) {
            break;
        }

        // Build description lookup: classid_instanceid → description
        const descMap = new Map<string, SteamInventoryDescription>();
        for (const desc of result.descriptions as SteamInventoryDescription[]) {
            descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
        }

        // Parse each asset
        for (const asset of result.assets as SteamInventoryAsset[]) {
            const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
            if (!desc) continue;

            // Skip non-marketable items (storage units, medals, etc.)
            if (!desc.marketable) continue;

            const parsed = parseInventoryItem(asset, desc);
            allItems.push(parsed);
        }

        // Check for more pages
        if (result.more_items && result.last_assetid) {
            lastAssetId = result.last_assetid;
        } else {
            hasMore = false;
        }
    }

    return allItems;
}

/**
 * Parse a single Steam inventory asset + description into our format.
 */
function parseInventoryItem(
    asset: SteamInventoryAsset,
    desc: SteamInventoryDescription
): ParsedInventoryItem {
    const imageUrl = desc.icon_url
        ? `https://community.akamai.steamstatic.com/economy/image/${desc.icon_url}/256x256`
        : "";

    // Parse weapon | skin from market_hash_name
    const parts = desc.market_hash_name.split(" | ");
    const weapon = parts[0] || null;
    const skin = parts[1]?.replace(/\s*\(.*\)/, "") || null;

    // Detect category
    const category = detectCategoryFromType(desc, desc.market_hash_name);

    // Extract rarity + type (Normal/StatTrak/Souvenir)
    const rarityTag = desc.tags?.find((t) => t.category === "Rarity");
    const qualityTag = desc.tags?.find((t) => t.category === "Quality");
    const rarity = normalizeRarity(
        rarityTag?.localized_tag_name ?? detectRarityFromType(desc.type) ?? null
    );
    const itemType = category === "weapon"
        ? detectTypeFromTagsOrName(
            qualityTag?.localized_tag_name ?? null,
            desc.market_hash_name
        )
        : null;

    // Extract exterior from tags or name
    const exteriorTag = desc.tags?.find((t) => t.category === "Exterior");
    const exterior = exteriorTag?.localized_tag_name ?? detectExteriorFromName(desc.market_hash_name);

    return {
        assetId: asset.assetid,
        marketHashName: desc.market_hash_name,
        name: desc.name,
        imageUrl,
        tradable: desc.tradable === 1,
        marketable: desc.marketable === 1,
        type: desc.type,
        itemType,
        rarity,
        exterior,
        weapon,
        skin,
        category,
    };
}

function detectExteriorFromName(hashName: string): string | null {
    const match = hashName.match(/\(([^)]+)\)\s*$/);
    if (!match) return null;
    const ext = match[1];
    const valid = [
        "Factory New", "Minimal Wear", "Field-Tested",
        "Well-Worn", "Battle-Scarred",
    ];
    return valid.includes(ext) ? ext : null;
}

function detectCategoryFromType(desc: SteamInventoryDescription, hashName: string): string {
    const type = desc.type.toLowerCase();
    const name = hashName.toLowerCase();
    const tags = desc.tags ?? [];

    const typeTag = tags.find((tag) => tag.category === "Type");
    const categoryTag = tags.find((tag) => tag.category === "Category");
    const miscTag = tags.find((tag) => tag.category === "Misc");
    const itemSetTag = tags.find((tag) => tag.category === "ItemSet");

    const tagValue = (
        typeTag?.localized_tag_name
        ?? categoryTag?.localized_tag_name
        ?? miscTag?.localized_tag_name
        ?? itemSetTag?.localized_tag_name
        ?? ""
    ).toLowerCase();

    if (tagValue.includes("container") || tagValue.includes("case") || tagValue.includes("capsule") || tagValue.includes("package")) return "container";
    if (tagValue.includes("key")) return "key";
    if (tagValue.includes("knife") || tagValue.includes("bayonet")) return "knife";
    if (tagValue.includes("gloves") || tagValue.includes("wraps")) return "glove";
    if (tagValue.includes("sticker")) return "sticker";
    if (tagValue.includes("agent")) return "agent";
    if (tagValue.includes("graffiti")) return "graffiti";
    if (tagValue.includes("music kit")) return "music_kit";
    if (tagValue.includes("patch")) return "patch";
    if (tagValue.includes("collectible") || tagValue.includes("medal") || tagValue.includes("pin")) return "collectible";
    if (tagValue.includes("tool")) return "tool";

    if (type.includes("container") || name.includes("case") || name.includes("capsule") || name.includes("package") || name.includes("collection")) return "container";
    if (type.includes("key") || name.includes("key")) return "key";
    if (type.includes("knife") || name.includes("knife") || name.includes("karambit") || name.includes("bayonet")) return "knife";
    if (type.includes("gloves") || name.includes("gloves") || name.includes("wraps")) return "glove";
    if (type.includes("sticker") || name.includes("sticker")) return "sticker";
    if (type.includes("agent") || type.includes("character") || name.includes("agent")) return "agent";
    if (type.includes("graffiti") || name.includes("graffiti")) return "graffiti";
    if (type.includes("music kit") || name.includes("music kit")) return "music_kit";
    if (type.includes("patch") || name.includes("patch")) return "patch";
    if (type.includes("collectible") || type.includes("medal") || name.includes("pin") || name.includes("coin")) return "collectible";
    if (type.includes("tool") || name.includes("pass") || name.includes("swap tool")) return "tool";
    return "weapon";
}
