/**
 * GET /api/market/news-feed — Unified feed of Steam news + price alerts
 */

import { NextResponse } from "next/server";
import { fetchSteamNews } from "@/lib/news/steam-news";
import { detectSignificantChanges } from "@/lib/market/price-activity";
import { fetchRssFeeds } from "@/lib/news/rss-feeds";
import { prisma } from "@/lib/db";

export type FeedItem = {
  id: string;
  type: "news" | "price_alert";
  title: string;
  summary: string;
  timestamp: Date;
  url?: string;
  source?: string;
  meta?: {
    itemName?: string;
    priceChange?: number;
    newPrice?: number;
    itemId?: string;
  };
};

const MARKET_KEYWORDS = [
  // Regulatory / Legal
  'ban', 'banned', 'lawsuit', 'legal', 'court', 'regulation', 'law', 'illegal',
  'gambling', 'lootbox', 'loot box', 'belgium', 'netherlands', 'australia',
  
  // Trade / Market mechanics
  'trade hold', 'trade ban', 'trade lock', 'market fee', 'tax', 'vat',
  'steam market', 'community market', 'market change', 'price change',
  'api change', 'api update',
  
  // Anti-cheat / Security (affects skin value)
  'xray', 'x-ray', 'scanner', 'vac', 'anti-cheat', 'anticheat', 'overwatch',
  'ban wave', 'cheater', 'exploit',
  
  // Valve / CS2 official changes
  'valve', 'cs2 update', 'csgo update', 'patch', 'operation', 'case',
  'collection', 'souvenir', 'sticker capsule', 'major', 'tournament',
  'drop rate', 'drop system', 'rare drop',
  
  // Economy / Trading platforms
  'csfloat', 'buff163', 'buff market', 'skinport', 'dmarket', 'bitskins',
  'steam inventory', 'trade bot', 'cashout',
  
  // Market events
  'crash', 'spike', 'surge', 'manipulation', 'investment', 'roi',
  'discontinued', 'contraband', 'rare pattern', 'blue gem', 'float value'
];

function isMarketAffecting(title: string, summary: string): boolean {
  const combined = `${title} ${summary}`.toLowerCase();
  return MARKET_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()));
}

interface FeedData {
  items: FeedItem[];
  updatedAt: string;
}

let cachedData: FeedData | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

const DB_CACHE_ID = "news-feed";

async function loadDbCache(): Promise<{ data: FeedData; updatedAt: Date } | null> {
    try {
        const row = await prisma.bulkPriceCache.findUnique({ where: { id: DB_CACHE_ID } });
        if (!row) return null;
        const data = JSON.parse(row.data) as FeedData;
        return { data, updatedAt: row.updatedAt };
    } catch {
        return null;
    }
}

async function saveDbCache(data: FeedData): Promise<void> {
    try {
        await prisma.bulkPriceCache.upsert({
            where: { id: DB_CACHE_ID },
            create: { id: DB_CACHE_ID, data: JSON.stringify(data), updatedAt: new Date() },
            update: { data: JSON.stringify(data), updatedAt: new Date() },
        });
    } catch (err) {
        console.warn("[News Feed] Failed to persist DB cache:", err);
    }
}

async function buildFeed(limit: number): Promise<FeedData> {
  const results = await Promise.allSettled([
    fetchSteamNews(10),
    fetchRssFeeds(),
    detectSignificantChanges({ limit: 10 }),
  ]);

  const newsItems = results[0].status === 'fulfilled' ? results[0].value : [];
  const rssItems = results[1].status === 'fulfilled' ? results[1].value : [];
  const priceActivities = results[2].status === 'fulfilled' ? results[2].value : [];

  const feedItems: FeedItem[] = [];

  for (const news of newsItems) {
    feedItems.push({
      id: `news-${news.id}`,
      type: "news",
      title: news.title,
      summary: news.contents,
      timestamp: news.date,
      url: news.url,
      source: news.source ?? 'steam',
    });
  }

  for (const rss of rssItems) {
    feedItems.push({
      id: `rss-${rss.id}`,
      type: "news",
      title: rss.title,
      summary: rss.contents,
      timestamp: rss.date,
      url: rss.url,
      source: rss.source,
    });
  }

  for (const activity of priceActivities) {
    feedItems.push({
      id: `price-${activity.itemId}`,
      type: "price_alert",
      title: `Price ${activity.direction === "up" ? "surge" : "drop"}: ${activity.itemName}`,
      summary: `Price changed ${activity.changePercent > 0 ? "+" : ""}${activity.changePercent.toFixed(1)}% from $${activity.previousPrice.toFixed(2)} to $${activity.currentPrice.toFixed(2)}`,
      timestamp: activity.detectedAt,
      meta: {
        itemName: activity.itemName,
        priceChange: activity.changePercent,
        newPrice: activity.currentPrice,
      },
    });
  }

  // Filter out items older than 90 days
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const recentItems = feedItems.filter(
    (item) => new Date(item.timestamp).getTime() >= cutoff.getTime()
  );

  // Filter news to only market-affecting content (price alerts always pass)
  const marketRelevantItems = recentItems.filter((item) => {
    if (item.type === 'price_alert') return true;
    return isMarketAffecting(item.title, item.summary);
  });

  // Sort by timestamp descending
  marketRelevantItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return {
    items: marketRelevantItems.slice(0, limit),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100
    );

    if (cachedData && Date.now() - cachedAt < CACHE_MS) {
      return NextResponse.json({
        success: true,
        data: {
          items: cachedData.items.slice(0, limit),
          updatedAt: cachedData.updatedAt,
        },
      }, {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" },
      });
    }

    const dbCache = await loadDbCache();
    if (dbCache && Date.now() - dbCache.updatedAt.getTime() < CACHE_MS) {
      cachedData = dbCache.data;
      cachedAt = dbCache.updatedAt.getTime();
      return NextResponse.json({
        success: true,
        data: {
          items: dbCache.data.items.slice(0, limit),
          updatedAt: dbCache.data.updatedAt,
        },
      }, {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" },
      });
    }

    const data = await buildFeed(limit);
    cachedData = data;
    cachedAt = Date.now();

    await saveDbCache(data);

    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" },
    });
  } catch (error) {
    console.error("[API /market/news-feed]", error);
    return NextResponse.json(
      { success: false, error: "Failed to build news feed" },
      { status: 500 }
    );
  }
}

// Reset cache (for testing)
export function __resetCache() {
  cachedData = null;
  cachedAt = 0;
}
