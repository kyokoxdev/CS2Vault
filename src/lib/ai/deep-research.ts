import { JSDOM } from "jsdom";

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
        });

        if (!response.ok) {
            console.error(`[Deep Research] DuckDuckGo search returned status ${response.status}`);
            return [];
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const results: SearchResult[] = [];

        const resultElements = doc.querySelectorAll(".result");
        for (const el of Array.from(resultElements)) {
            const titleEl = el.querySelector(".result__a");
            const snippetEl = el.querySelector(".result__snippet");
            if (!titleEl) continue;

            let href = titleEl.getAttribute("href") || "";
            if (href.includes("uddg=")) {
                const match = href.match(/[?&]uddg=([^&]+)/);
                if (match) {
                    href = decodeURIComponent(match[1]);
                }
            }

            const title = titleEl.textContent?.trim() || "";
            const snippet = snippetEl?.textContent?.trim() || "";

            if (title && href) {
                results.push({ title, url: href, snippet });
            }
            if (results.length >= 5) break;
        }

        return results;
    } catch (e) {
        console.error("[Deep Research] DuckDuckGo search error:", e);
        return [];
    }
}

export async function fetchPageContent(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(5000), // 5s timeout
        });
        if (!response.ok) return "";
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // Remove script, style, head, nav, footer, header, iframe, noscript elements
        const tagsToRemove = ["script", "style", "head", "nav", "footer", "header", "iframe", "noscript"];
        tagsToRemove.forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => el.remove());
        });

        const text = doc.body?.textContent || "";
        return text.replace(/\s+/g, " ").trim().slice(0, 3000); // grab first 3000 chars to avoid model context overflow
    } catch (e) {
        console.error(`[Deep Research] Failed to fetch page content for ${url}:`, e);
        return "";
    }
}

export interface DeepResearchResult {
    sources: { title: string; url: string; content: string }[];
    contextBlock: string;
}

export async function performDeepResearch(query: string): Promise<DeepResearchResult> {
    const searchResults = await searchDuckDuckGo(query);
    const topResults = searchResults.slice(0, 3); // Read top 3 sources

    const sourceContents = await Promise.all(
        topResults.map(async (res) => {
            const content = await fetchPageContent(res.url);
            return {
                title: res.title,
                url: res.url,
                content: content || res.snippet // Fallback to snippet if fetch fails
            };
        })
    );

    const contextBlock = [
        "=== DEEP RESEARCH SOURCES ===",
        ...sourceContents.map((source, index) => {
            return `[Source ${index + 1}]:\nTitle: ${source.title}\nURL: ${source.url}\nContent: ${source.content}\n---`;
        }),
        "=== END DEEP RESEARCH SOURCES ==="
    ].join("\n");

    return {
        sources: sourceContents,
        contextBlock
    };
}
