import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

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

// Create a server-safe DOMPurify instance using JSDOM
const window = new JSDOM("").window;
const purify = DOMPurify(window);

/**
 * Properly decode all HTML entities including named, decimal, and hexadecimal.
 * Uses DOMParser for accurate entity decoding in a server-safe manner.
 * This fixes:
 * - Issue #1: Incomplete string escaping/encoding (now handles all entity types)
 * - Issue #2: Double escaping/unescaping (single-pass decoding)
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  // Use the JSDOM window to create a temporary textarea element
  // This is the most reliable cross-platform way to decode HTML entities
  const textarea = window.document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Properly strip HTML tags and decode HTML entities using a robust library approach.
 * Uses DOMPurify to sanitize HTML and then extracts text content.
 * This fixes:
 * - Issue #3: Incomplete multi-character sanitization (DOMPurify handles all tag variations)
 */
export function sanitizeContents(raw: string): string {
  if (!raw) return "";

  // First, use DOMPurify to sanitize and strip all HTML tags
  // ALLOWED_TAGS: [] means no HTML tags are allowed - all tags are stripped
  const sanitized = purify.sanitize(raw, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  // Decode HTML entities properly (named, decimal &#123;, hexadecimal &#x7B;)
  const decoded = decodeHtmlEntities(sanitized);

  // Truncate if longer than 200 characters
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
