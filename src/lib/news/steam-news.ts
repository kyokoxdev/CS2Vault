export type NewsSource = "steam" | "steamdb" | "valve";

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: Date;
  source: NewsSource;
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export function sanitizeContents(raw: string): string {
  const stripped = stripHtml(raw);
  const decoded = decodeHtmlEntities(stripped);
  return decoded.length > 200 ? decoded.slice(0, 200) : decoded;
}

export async function fetchSteamNews(
  count: number = 10
): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=${count}&maxlength=300&format=json`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[Steam News] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data?.appnews?.newsitems;

    if (!Array.isArray(items)) {
      console.error("[Steam News] Unexpected response shape");
      return [];
    }

    return items.map(
      (item: {
        gid: string;
        title: string;
        url: string;
        author: string;
        contents: string;
        date: number;
      }) => ({
        id: item.gid,
        title: item.title,
        url: item.url,
        author: item.author,
        contents: sanitizeContents(item.contents ?? ""),
        date: new Date(item.date * 1000),
        source: "steam" as const,
      })
    );
  } catch (error) {
    console.error("[Steam News] Fetch failed:", error);
    return [];
  }
}
