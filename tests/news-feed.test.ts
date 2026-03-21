import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    priceSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

// Mock RSS feeds (fetchRssFeeds is called via Promise.allSettled in the route)
vi.mock("@/lib/news/rss-feeds", () => ({
  fetchRssFeeds: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { fetchRssFeeds } from "@/lib/news/rss-feeds";
import { GET, __resetCache } from "../src/app/api/market/news-feed/route";
import { fetchSteamNews } from "../src/lib/news/steam-news";

const mockFindMany = vi.mocked(prisma.priceSnapshot.findMany);
const mockFetchRssFeeds = vi.mocked(fetchRssFeeds);

function makeSnapshot(overrides: {
  id?: number;
  itemId: string;
  price: number;
  timestamp: Date;
  itemName: string;
}) {
  return {
    id: overrides.id ?? 1,
    itemId: overrides.itemId,
    price: overrides.price,
    volume: null,
    source: "steam",
    timestamp: overrides.timestamp,
    item: {
      id: overrides.itemId,
      name: overrides.itemName,
      marketHashName: overrides.itemName,
      isActive: true,
    },
  };
}

const NOW_TS = Math.floor(Date.now() / 1000);

function makeSteamNewsResponse(items: Array<{
  gid: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: number;
}>) {
  return {
    ok: true,
    json: async () => ({ appnews: { newsitems: items } }),
  };
}

function makeRequest(limit?: number): Request {
  const url = limit
    ? `http://localhost:3000/api/market/news-feed?limit=${limit}`
    : "http://localhost:3000/api/market/news-feed";
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCache();
  // Default: RSS feeds return empty (most tests don't need RSS data)
  mockFetchRssFeeds.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/market/news-feed", () => {
  it("returns merged news + price_alert items sorted by timestamp desc", async () => {
    // Steam news from 2 hours ago
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "news-1",
            title: "CS2 Update",
            url: "https://store.steampowered.com/news/1",
            author: "Valve",
            contents: "New update released",
            date: NOW_TS - 7200, // 2 hours ago
          },
        ])
      )
    );

    // Price activity from 1 hour ago (15% change > 5% threshold)
    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        itemName: "AK-47 | Redline",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 115,
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        itemName: "AK-47 | Redline",
      }),
    ] as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
    expect(body.data.items.length).toBe(2);
    expect(body.data.updatedAt).toBeDefined();

    // Price alert (detected now) should come before news (2hrs ago)
    expect(body.data.items[0].type).toBe("price_alert");
    expect(body.data.items[1].type).toBe("news");

    // Verify news item shape
    const newsItem = body.data.items[1];
    expect(newsItem.id).toBe("news-news-1");
    expect(newsItem.title).toBe("CS2 Update");
    expect(newsItem.url).toBe("https://store.steampowered.com/news/1");

    // Verify price_alert item shape
    const priceItem = body.data.items[0];
    expect(priceItem.title).toContain("Price surge");
    expect(priceItem.title).toContain("AK-47 | Redline");
    expect(priceItem.meta.itemName).toBe("AK-47 | Redline");
  });

  it("returns only price_alert items when Steam API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    mockFindMany.mockResolvedValue([
      makeSnapshot({
        id: 1,
        itemId: "item-1",
        price: 100,
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
        itemName: "AWP | Asiimov",
      }),
      makeSnapshot({
        id: 2,
        itemId: "item-1",
        price: 85,
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
        itemName: "AWP | Asiimov",
      }),
    ] as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].type).toBe("price_alert");
    expect(body.data.items[0].title).toContain("Price drop");
  });

  it("strips HTML tags from Steam news contents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "html-1",
            title: "CS2 Update with HTML",
            url: "https://example.com",
            author: "Test",
            contents: "<b>bold text</b> and <i>italic</i>",
            date: NOW_TS - 3600,
          },
        ])
      )
    );

    mockFindMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    const item = body.data.items[0];
    expect(item.summary).toBe("bold text and italic");
    expect(item.summary).not.toContain("<");
    expect(item.summary).not.toContain(">");
  });

  it("decodes &amp; entity to & in contents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "entity-1",
            title: "CS2 Update: Rock & Roll",
            url: "https://example.com",
            author: "Test",
            contents: "Rock &amp; Roll",
            date: NOW_TS - 3600,
          },
        ])
      )
    );

    mockFindMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.data.items[0].summary).toBe("Rock & Roll");
  });

  it("respects limit parameter", async () => {
    const newsItems = Array.from({ length: 10 }, (_, i) => ({
      gid: `news-${i}`,
      title: `News ${i}`,
      url: `https://example.com/${i}`,
      author: "Valve",
      contents: `Content ${i}`,
      date: NOW_TS - (i + 1) * 3600,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeSteamNewsResponse(newsItems))
    );

    mockFindMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest(3));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeLessThanOrEqual(3);
  });

  it("cache: second call within TTL returns same updatedAt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "cache-1",
            title: "Cache Test",
            url: "https://example.com",
            author: "Test",
            contents: "Cached content",
            date: NOW_TS - 3600,
          },
        ])
      )
    );

    mockFindMany.mockResolvedValue([] as never);

    const res1 = await GET(makeRequest());
    const body1 = await res1.json();

    // Second call — should use cache
    const res2 = await GET(makeRequest());
    const body2 = await res2.json();

    expect(body1.data.updatedAt).toBe(body2.data.updatedAt);

    // Prisma should only have been called once
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("includes RSS feed items when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([])
      )
    );

    mockFindMany.mockResolvedValue([] as never);

    // RSS returns items
    mockFetchRssFeeds.mockResolvedValue([
      {
        id: "rss-hltv-1",
        title: "HLTV: Major Update",
        url: "https://www.hltv.org/news/1",
        author: "hltv",
        contents: "Major tournament announced",
        date: new Date(Date.now() - 3600000),
        source: "hltv" as const,
      },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].type).toBe("news");
    expect(body.data.items[0].id).toBe("rss-rss-hltv-1");
    expect(body.data.items[0].title).toBe("HLTV: Major Update");
  });
});

describe("fetchSteamNews", () => {
  it("strips HTML and decodes entities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "strip-1",
            title: "Strip Test",
            url: "https://example.com",
            author: "Test",
            contents: "<p>Hello &amp; welcome &lt;world&gt;</p>",
            date: NOW_TS,
          },
        ])
      )
    );

    const items = await fetchSteamNews(1);
    expect(items).toHaveLength(1);
    expect(items[0].contents).toBe("Hello & welcome <world>");
    expect(items[0].source).toBe("steam");
  });

  it("returns empty array on fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    const items = await fetchSteamNews();
    expect(items).toEqual([]);
  });

  it("truncates contents to 200 characters", async () => {
    const longContent = "A".repeat(300);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSteamNewsResponse([
          {
            gid: "trunc-1",
            title: "Truncation Test",
            url: "https://example.com",
            author: "Test",
            contents: longContent,
            date: NOW_TS,
          },
        ])
      )
    );

    const items = await fetchSteamNews(1);
    expect(items[0].contents.length).toBeLessThanOrEqual(200);
  });
});

describe("90-day date filtering", () => {
  it("filters out Steam news items older than 90 days", async () => {
    const OLD_DATE = NOW_TS - (91 * 24 * 3600); // 91 days ago
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSteamNewsResponse([{
        gid: "old-1",
        title: "Very Old News",
        url: "https://example.com/old",
        author: "Valve",
        contents: "Old content",
        date: OLD_DATE,
      }])
    ));
    mockFindMany.mockResolvedValue([] as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
  });

  it("allows recent Steam news items through", async () => {
    const RECENT_DATE = NOW_TS - 3600; // 1 hour ago
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSteamNewsResponse([{
        gid: "recent-1",
        title: "Valve CS2 Update",
        url: "https://example.com/recent",
        author: "Valve",
        contents: "Recent valve update content",
        date: RECENT_DATE,
      }])
    ));
    mockFindMany.mockResolvedValue([] as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe("Valve CS2 Update");
  });

  it("filters old RSS items via post-merge cutoff", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSteamNewsResponse([])));
    mockFindMany.mockResolvedValue([] as never);
    mockFetchRssFeeds.mockResolvedValue([{
      id: "rss-old-1",
      title: "Old RSS Article",
      url: "https://example.com/old-rss",
      author: "hltv",
      contents: "Old RSS content",
      date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
      source: "hltv" as const,
    }]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
  });

  it("returns success with empty items when all items are older than 90 days", async () => {
    const OLD_DATE = NOW_TS - (120 * 24 * 3600); // 120 days ago
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSteamNewsResponse([{
        gid: "old-2",
        title: "Ancient News",
        url: "https://example.com/ancient",
        author: "Valve",
        contents: "Ancient content",
        date: OLD_DATE,
      }])
    ));
    mockFindMany.mockResolvedValue([] as never);
    mockFetchRssFeeds.mockResolvedValue([{
      id: "rss-old-2",
      title: "Ancient RSS",
      url: "https://example.com/ancient-rss",
      author: "reddit",
      contents: "Ancient RSS content",
      date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
      source: "reddit" as const,
    }]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
  });

  it("keeps only recent items when mixing old and new Steam news", async () => {
    const OLD_DATE = NOW_TS - (95 * 24 * 3600); // 95 days ago
    const RECENT_DATE = NOW_TS - 7200; // 2 hours ago
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeSteamNewsResponse([
        { gid: "mix-old", title: "Old Valve Mix", url: "https://example.com/old", author: "Valve", contents: "Old valve update", date: OLD_DATE },
        { gid: "mix-recent", title: "Recent Valve Mix", url: "https://example.com/recent", author: "Valve", contents: "Recent valve update", date: RECENT_DATE },
      ])
    ));
    mockFindMany.mockResolvedValue([] as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe("Recent Valve Mix");
  });
});
