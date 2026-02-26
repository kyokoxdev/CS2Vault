/**
 * GET /api/search — Search Steam Market for CS2 items
 *
 * Queries Steam's market search API and returns matching items.
 * Used by the autocomplete component when adding items to watchlist.
 *
 * Query params:
 *   q: search query (min 2 chars)
 */

import { NextRequest, NextResponse } from "next/server";
import { detectRarityFromType, detectTypeFromName } from "@/lib/market/rarity";

const STEAM_SEARCH_URL =
    "https://steamcommunity.com/market/search/render/";

interface SteamSearchResult {
    name: string;
    hash_name: string;
    asset_description?: {
        type?: string;
        market_hash_name?: string;
        icon_url?: string;
    };
    sell_price_text?: string;
    sell_listings?: number;
    sell_price?: number;
}


/**
 * Extract exterior (wear) from a market hash name.
 * E.g. "AK-47 | Redline (Field-Tested)" → "Field-Tested"
 */
function detectExterior(hashName: string): string | null {
    const match = hashName.match(/\(([^)]+)\)\s*$/);
    if (!match) return null;
    const exterior = match[1];
    const validExteriors = [
        "Factory New", "Minimal Wear", "Field-Tested",
        "Well-Worn", "Battle-Scarred",
    ];
    return validExteriors.includes(exterior) ? exterior : null;
}

/**
 * Detect item category from Steam's asset type string and item name.
 * Steam provides types like "Base Grade Container", "Covert Rifle", etc.
 */
function detectCategory(steamType: string | undefined, hashName: string): string {
    const type = (steamType ?? "").toLowerCase();
    const name = hashName.toLowerCase();

    // Containers (cases, capsules, packages, etc.)
    if (type.includes("container") || name.includes("case") ||
        name.includes("capsule") || name.includes("package") ||
        name.includes("collection")) {
        return "container";
    }

    // Keys
    if (type.includes("key") || name.includes("key")) {
        return "key";
    }

    // Knives & melee
    if (type.includes("knife") || type.includes("bayonet") ||
        name.includes("knife") || name.includes("karambit") ||
        name.includes("bayonet") || name.includes("gut") ||
        name.includes("flip") || name.includes("falchion") ||
        name.includes("bowie") || name.includes("butterfly") ||
        name.includes("navaja") || name.includes("stiletto") ||
        name.includes("talon") || name.includes("ursus") ||
        name.includes("paracord") || name.includes("survival") ||
        name.includes("nomad") || name.includes("skeleton") ||
        name.includes("classic knife") || name.includes("kukri")) {
        return "knife";
    }

    // Gloves
    if (type.includes("gloves") || type.includes("wraps") ||
        name.includes("gloves") || name.includes("wraps")) {
        return "glove";
    }

    // Stickers
    if (type.includes("sticker") || name.includes("sticker")) {
        return "sticker";
    }

    // Agents
    if (type.includes("agent") || name.includes("agent")) {
        return "agent";
    }

    // Graffiti
    if (type.includes("graffiti") || name.includes("graffiti")) {
        return "graffiti";
    }

    // Music kits
    if (type.includes("music kit") || name.includes("music kit")) {
        return "music_kit";
    }

    // Patches
    if (type.includes("patch") || name.includes("patch")) {
        return "patch";
    }

    // Collectibles (pins, coins, etc.)
    if (type.includes("collectible") || name.includes("pin") || name.includes("coin")) {
        return "collectible";
    }

    // Tools (pass, swap, etc.)
    if (type.includes("tool") || name.includes("pass") || name.includes("swap tool")) {
        return "tool";
    }

    // Default: weapon
    return "weapon";
}

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
        return NextResponse.json({
            success: true,
            data: { results: [], query: q ?? "" },
        });
    }

    try {
        const params = new URLSearchParams({
            query: q,
            start: "0",
            count: "15",
            search_descriptions: "0",
            sort_column: "popular",
            sort_dir: "desc",
            appid: "730", // CS2
            norender: "1",
        });

        const res = await fetch(`${STEAM_SEARCH_URL}?${params}`, {
            headers: {
                "Accept-Language": "en-US,en;q=0.9",
            },
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: "Steam search unavailable" },
                { status: 502 }
            );
        }

        const data = await res.json();

        if (!data.success || !data.results) {
            return NextResponse.json({
                success: true,
                data: { results: [], query: q },
            });
        }

        const results = data.results.map((item: SteamSearchResult) => ({
            hashName: item.hash_name,
            name: item.name,
            imageUrl: item.asset_description?.icon_url
                ? `https://community.akamai.steamstatic.com/economy/image/${item.asset_description.icon_url}/128x128`
                : null,
            price: item.sell_price_text ?? null,
            listings: item.sell_listings ?? 0,
            steamType: item.asset_description?.type ?? null,
            category: detectCategory(item.asset_description?.type, item.hash_name),
            type: detectTypeFromName(item.hash_name),
            rarity: detectRarityFromType(item.asset_description?.type ?? null),
            exterior: detectExterior(item.hash_name),
        }));

        return NextResponse.json({
            success: true,
            data: {
                results,
                query: q,
                totalResults: data.total_count ?? results.length,
            },
        });
    } catch (error) {
        console.error("[API /search]", error);
        return NextResponse.json(
            { success: false, error: "Search failed" },
            { status: 500 }
        );
    }
}
