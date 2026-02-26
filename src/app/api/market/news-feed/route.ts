/**
 * GET /api/market/news-feed — Unified feed of Steam news + price alerts
 */

import { NextResponse } from "next/server";
import { fetchSteamNews } from "@/lib/news/steam-news";
import { detectSignificantChanges } from "@/lib/market/price-activity";

export type FeedItem = {
  id: string;
  type: "news" | "price_alert";
  title: string;
  summary: string;
  timestamp: Date;
  url?: string;
  meta?: {
    itemName?: string;
    priceChange?: number;
    newPrice?: number;
  };
};

interface FeedData {
  items: FeedItem[];
  updatedAt: string;
}

let cachedData: FeedData | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function buildFeed(limit: number): Promise<FeedData> {
  const [newsItems, priceActivities] = await Promise.all([
    fetchSteamNews(10),
    detectSignificantChanges({ limit: 10 }),
  ]);

  const feedItems: FeedItem[] = [];

  for (const news of newsItems) {
    feedItems.push({
      id: `news-${news.id}`,
      type: "news",
      title: news.title,
      summary: news.contents,
      timestamp: news.date,
      url: news.url,
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

  // Sort by timestamp descending
  feedItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return {
    items: feedItems.slice(0, limit),
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
      });
    }

    const data = await buildFeed(limit);
    cachedData = data;
    cachedAt = Date.now();

    return NextResponse.json({ success: true, data });
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
