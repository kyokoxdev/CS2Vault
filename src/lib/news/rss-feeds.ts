import Parser from "rss-parser";
import type { NewsItem, NewsSource } from "./steam-news";
import { sanitizeContents } from "./steam-news";

const RSS_SOURCES: { name: string; url: string; source: NewsSource }[] = [
  { name: "steamdb", url: "https://steamdb.info/blog/rss/", source: "steamdb" },
  { name: "valve", url: "https://blog.counter-strike.net/index.php/feed/", source: "valve" },
];

async function fetchSingleFeed(
  feed: (typeof RSS_SOURCES)[number]
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const parser = new Parser({
      headers: {
        // Reddit returns 429 without a custom User-Agent
        "User-Agent": "cs2vault/1.0",
      },
      requestOptions: {
        signal: controller.signal as never,
      },
    });

    const result = await parser.parseURL(feed.url);
    clearTimeout(timeout);

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

    const mapped = (result.items ?? []).map((item) => ({
      id: item.guid ?? item.link ?? crypto.randomUUID(),
      title: item.title ?? "Untitled",
      url: item.link ?? "",
      author: item.creator ?? item.author ?? feed.name,
      contents: sanitizeContents(item.contentSnippet ?? item.content ?? ""),
      date: item.isoDate ? new Date(item.isoDate) : new Date(0),
      source: feed.source,
    }));

    return mapped.filter((item) => item.date >= cutoff);
  } catch (error) {
    clearTimeout(timeout);
    console.error(`[RSS ${feed.name}] Fetch failed:`, error);
    return [];
  }
}

export async function fetchRssFeeds(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map((feed) => fetchSingleFeed(feed))
  );

  const allItems: NewsItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
    // rejected results already logged in fetchSingleFeed
  }

  // Sort by date descending (newest first)
  allItems.sort((a, b) => b.date.getTime() - a.date.getTime());

  return allItems;
}
