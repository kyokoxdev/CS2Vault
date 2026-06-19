/**
 * POST /api/watchlist/add
 *
 * Client-side handler for the Aegis /watch slash command.
 * Accepts a hashName (market hash name or display name), looks it up in the
 * database, and marks it as watched.  If the item is not yet tracked it is
 * created using metadata fetched from the Steam search API so the caller
 * always gets a meaningful confirmation message.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

const BodySchema = z.object({
    hashName: z.string().min(1).max(300),
});

const STEAM_SEARCH_URL = "https://steamcommunity.com/market/search/render/";

interface SteamResult {
    name: string;
    hash_name: string;
    asset_description?: {
        type?: string;
        icon_url?: string;
    };
    sell_price_text?: string;
}

async function fetchSteamItemByHashName(hashName: string): Promise<SteamResult | null> {
    try {
        const params = new URLSearchParams({
            query: hashName,
            start: "0",
            count: "5",
            search_descriptions: "0",
            sort_column: "popular",
            sort_dir: "desc",
            appid: "730",
            norender: "1",
        });
        const res = await fetch(`${STEAM_SEARCH_URL}?${params}`, {
            headers: { "Accept-Language": "en-US,en;q=0.9" },
            next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.results) || data.results.length === 0) return null;
        // Best-effort exact match first, then first result
        const exact = (data.results as SteamResult[]).find(
            (r) => r.hash_name.toLowerCase() === hashName.toLowerCase()
        );
        return exact ?? (data.results[0] as SteamResult);
    } catch {
        return null;
    }
}

function detectCategory(hashName: string, steamType?: string): string {
    const t = (steamType ?? "").toLowerCase();
    const n = hashName.toLowerCase();
    if (t.includes("container") || n.includes("case") || n.includes("capsule")) return "container";
    if (t.includes("key") || n.includes("key")) return "key";
    if (t.includes("knife") || t.includes("bayonet") || n.includes("knife") || n.includes("karambit")) return "knife";
    if (t.includes("gloves") || n.includes("gloves")) return "glove";
    if (t.includes("sticker") || n.includes("sticker")) return "sticker";
    return "weapon";
}

export async function POST(request: NextRequest) {
    try {
        const { error: authError } = await requireAuth();
        if (authError) return authError;

        const body = await request.json();
        const { hashName } = BodySchema.parse(body);

        // Check for existing item (exact hash-name or case-insensitive name)
        const allActive = await prisma.item.findMany({
            where: { isActive: true },
            select: { id: true, name: true, marketHashName: true, isWatched: true },
        });

        const normalized = hashName.toLowerCase();
        const existing = allActive.find(
            (i) =>
                i.marketHashName === hashName ||
                i.marketHashName.toLowerCase() === normalized ||
                i.name === hashName ||
                i.name.toLowerCase() === normalized
        );

        if (existing) {
            if (existing.isWatched) {
                return NextResponse.json({
                    success: true,
                    alreadyWatched: true,
                    message: `✅ **${existing.name}** is already on your Watchlist.`,
                });
            }
            await prisma.item.update({ where: { id: existing.id }, data: { isWatched: true } });
            return NextResponse.json({
                success: true,
                message: `✅ **${existing.name}** has been added to your Watchlist.`,
            });
        }

        // Item not tracked yet — try to fetch from Steam and create it
        const steamItem = await fetchSteamItemByHashName(hashName);

        if (!steamItem) {
            return NextResponse.json(
                {
                    success: false,
                    message: `❌ Could not find **${hashName}** on the Steam Market. Double-check the item name and try again.`,
                },
                { status: 404 }
            );
        }

        const category = detectCategory(steamItem.hash_name, steamItem.asset_description?.type);
        const imageUrl = steamItem.asset_description?.icon_url
            ? `https://community.akamai.steamstatic.com/economy/image/${steamItem.asset_description.icon_url}/128x128`
            : null;

        const created = await prisma.item.create({
            data: {
                marketHashName: steamItem.hash_name,
                name: steamItem.name,
                category,
                isWatched: true,
                imageUrl,
            },
        });

        return NextResponse.json(
            {
                success: true,
                message: `✅ **${created.name}** has been added to your Watchlist.`,
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: "❌ Invalid request body.", error: "Invalid request body" },
                { status: 400 }
            );
        }
        console.error("[API /watchlist/add]", error);
        return NextResponse.json(
            { success: false, message: "❌ Server error — could not update the Watchlist." },
            { status: 500 }
        );
    }
}
