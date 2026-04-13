import type { MarketContext } from "@/types";

function formatUSD(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    return `$${n.toFixed(2)}`;
}

function buildMoversBlock(gainers: MarketContext["topGainers"], losers: MarketContext["topLosers"]): string {
    const lines: string[] = [];
    if (gainers.length > 0) {
        lines.push("Top Gainers: " + gainers.map(g => `${g.name} ${formatUSD(g.price)} (+${g.changePercent.toFixed(1)}%)`).join(" | "));
    }
    if (losers.length > 0) {
        lines.push("Top Losers: " + losers.map(l => `${l.name} ${formatUSD(l.price)} (${l.changePercent.toFixed(1)}%)`).join(" | "));
    }
    return lines.join("\n");
}

function buildMarketOverviewBlock(overview: MarketContext["marketOverview"]): string {
    if (!overview) return "";
    const parts = [];
    if (overview.totalMarketCap > 0) parts.push(`Market Cap: ${formatUSD(overview.totalMarketCap)}`);
    parts.push(`Tracked Items: ${overview.trackedItemCount}`);
    parts.push(`Watchlist: ${overview.watchlistCount} items`);
    parts.push(`Price Source: ${overview.priceSource}`);
    if (overview.lastSyncAge) parts.push(`Last Sync: ${overview.lastSyncAge}`);
    return parts.join(" | ");
}

function buildPortfolioBlock(summary: MarketContext["portfolioSummary"], inventory: MarketContext["inventory"]): string {
    if (!summary) return "";
    const lines: string[] = [];
    lines.push(`Portfolio: ${formatUSD(summary.totalValue)} total | ${summary.itemCount} items held | ${summary.soldCount} sold`);
    lines.push(`Unrealized P&L: ${formatUSD(summary.unrealizedPnL)} | Realized P&L: ${formatUSD(summary.realizedPnL)}`);

    if (inventory && inventory.length > 0) {
        lines.push("Inventory:");
        for (const item of inventory) {
            const meta = [item.rarity, item.exterior].filter(Boolean).join(", ");
            lines.push(`  - ${item.name}${meta ? ` [${meta}]` : ""}: ${item.quantity}x @ ${formatUSD(item.currentPrice)} | Avg Cost: ${formatUSD(item.acquiredPrice)} | PnL: ${formatUSD(item.pnl)}`);
        }
    }
    return lines.join("\n");
}

function buildSoldBlock(soldItems: MarketContext["soldItems"]): string {
    if (!soldItems || soldItems.length === 0) return "";
    const lines = ["Recent Sales:"];
    for (const s of soldItems) {
        lines.push(`  - ${s.name}: Bought ${formatUSD(s.acquiredPrice)} → Sold ${formatUSD(s.soldPrice)} (${formatUSD(s.realizedPnl)}) on ${s.soldAt}`);
    }
    return lines.join("\n");
}

function buildWatchlistBlock(watchlist: MarketContext["watchlist"]): string {
    if (!watchlist || watchlist.length === 0) return "";
    const lines = ["Watchlist:"];
    for (const w of watchlist) {
        const change = w.changePercent >= 0 ? `+${w.changePercent.toFixed(1)}%` : `${w.changePercent.toFixed(1)}%`;
        lines.push(`  - ${w.name}${w.rarity ? ` [${w.rarity}]` : ""}: ${formatUSD(w.currentPrice)} (${change})`);
    }
    return lines.join("\n");
}

function buildTargetedItemBlock(data: MarketContext["targetedItemData"]): string {
    if (!data) return "";
    const lines: string[] = [];
    const meta = [data.rarity, data.exterior, data.category].filter(Boolean).join(", ");
    lines.push(`Targeted Item: ${data.name}${meta ? ` [${meta}]` : ""} — Current: ${formatUSD(data.currentPrice)}`);

    if (data.ohlcv7Days && data.ohlcv7Days.length > 0) {
        lines.push("7-Day OHLCV:");
        for (const c of data.ohlcv7Days) {
            lines.push(`  ${c.date}: O:${formatUSD(c.open)} H:${formatUSD(c.high)} L:${formatUSD(c.low)} C:${formatUSD(c.close)} V:${c.volume}`);
        }
    }

    if (data.history30Days.length > 0) {
        lines.push("30-Day Daily Close: " + data.history30Days.map(h => `${h.date}:${formatUSD(h.price)}`).join(", "));
    }
    return lines.join("\n");
}

function buildNewsBlock(headlines: MarketContext["newsHeadlines"]): string {
    if (!headlines || headlines.length === 0) return "";
    const lines = ["Recent CS2 News:"];
    for (const h of headlines) {
        lines.push(`  - [${h.date}] ${h.title} (${h.source})`);
    }
    return lines.join("\n");
}

export function buildSystemPrompt(context: MarketContext): string {
    const sections = [
        buildMarketOverviewBlock(context.marketOverview),
        buildMoversBlock(context.topGainers, context.topLosers),
        buildPortfolioBlock(context.portfolioSummary, context.inventory),
        buildSoldBlock(context.soldItems),
        buildWatchlistBlock(context.watchlist),
        buildTargetedItemBlock(context.targetedItemData),
        buildNewsBlock(context.newsHeadlines),
    ].filter(Boolean);

    const contextBlock = sections.length > 0
        ? `\n=== LIVE MARKET DATA ===\n${sections.join("\n\n")}\n=== END DATA ===`
        : "\n(No market data available)";

    const errorNote = context.contextError
        ? "\nNote: Some market data may be incomplete due to a temporary retrieval issue. Mention this if the user asks about missing data."
        : "";

    return `You are the CS2Vault Market Agent — an expert investment advisor for the Counter-Strike 2 skin market.
You have access to live portfolio data, market movers, watchlist tracking, OHLCV candlestick data, and recent news.
${contextBlock}${errorNote}

Guidelines:
- Use the data above to give specific, data-backed advice. Reference actual prices, trends, and percentage changes.
- When OHLCV data is available, analyze support/resistance levels, volatility (high-low range), and volume trends.
- When 30-day history is available, identify trends and provide timeframe-based projections.
- For portfolio questions, factor in both unrealized and realized P&L. Consider rarity and exterior when relevant.
- Reference recent news when it may impact market sentiment.
- If an item is NOT in the data, tell the user: "I don't have tracking data for this item yet. Add it to your Watchlist so I can start charting its trajectory."
- Be concise. Use markdown formatting.`;
}
