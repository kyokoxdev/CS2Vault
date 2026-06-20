import type { AIChatOptions, MarketContext } from "@/types";

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

function buildWatchlistActionBlock(action: MarketContext["watchlistAction"]): string {
    if (!action) return "";
    return `Aegis Watchlist Action: ${action.message}`;
}

function buildTargetedItemBlock(data: MarketContext["targetedItemData"]): string {
    if (!data) return "";
    const lines: string[] = [];
    const meta = [data.rarity, data.exterior, data.category].filter(Boolean).join(", ");
    lines.push(`Targeted Item: ${data.name}${meta ? ` [${meta}]` : ""} — Current: ${formatUSD(data.currentPrice)}`);
    lines.push(`Available History: ${data.allHistoryPoints} price snapshots${data.oldestHistoryDate && data.latestHistoryDate ? ` from ${data.oldestHistoryDate} to ${data.latestHistoryDate}` : ""}`);

    if (data.ohlcvDaily && data.ohlcvDaily.length > 0) {
        lines.push(`${data.ohlcvWindowDays ?? 0}-Day OHLCV:`);
        for (const c of data.ohlcvDaily) {
            lines.push(`  ${c.date}: O:${formatUSD(c.open)} H:${formatUSD(c.high)} L:${formatUSD(c.low)} C:${formatUSD(c.close)} V:${c.volume}`);
        }
    }

    if (data.historyDaily.length > 0) {
        lines.push(`${data.historyWindowDays}-Day Daily Close: ` + data.historyDaily.map(h => `${h.date}:${formatUSD(h.price)}`).join(", "));
    }
    return lines.join("\n");
}

function buildResearchPacketBlock(packet: MarketContext["researchPacket"]): string {
    if (!packet) return "";

    const lines = [
        `Researcher Packet: ${packet.retrievalMode} at ${packet.generatedAt}`,
        "Coverage:",
        ...packet.coverage.map(item => `  - ${item}`),
    ];

    if (packet.currentPricingSignals.length > 0) {
        lines.push("Current Pricing Signals:");
        lines.push(...packet.currentPricingSignals.map(item => `  - ${item}`));
    }

    if (packet.historicalSignals.length > 0) {
        lines.push("Historical Signals:");
        lines.push(...packet.historicalSignals.map(item => `  - ${item}`));
    }

    if (packet.dataLimits.length > 0) {
        lines.push("Data Limits:");
        lines.push(...packet.dataLimits.map(item => `  - ${item}`));
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

function buildAegisMemoryBlock(memories: MarketContext["aegisMemories"]): string {
    if (!memories || memories.length === 0) return "";

    const lines = ["Aegis Notebook Memories:"];
    for (const memory of memories) {
        const tags = memory.tags.length > 0 ? ` [${memory.tags.join(", ")}]` : "";
        lines.push(`  - ${memory.title} (${memory.kind})${tags}: ${memory.content}`);
    }
    return lines.join("\n");
}

function getReasoningDirective(depth: AIChatOptions["reasoningDepth"]): string {
    if (!depth) {
        return "";
    }

    if (depth === "none") {
        return "Reasoning depth: None. Keep the answer direct and avoid extra scenario work unless the user asks for it.";
    }

    if (depth === "minimal") {
        return "Reasoning depth: Minimal. Prefer fast, direct answers with only the essential calculations and one decisive next step.";
    }

    if (depth === "low") {
        return "Reasoning depth: Low. Keep analysis compact while still checking the most important market evidence.";
    }

    if (depth === "medium") {
        return "Reasoning depth: Medium. Use enough evidence and calculations to justify the answer without over-explaining obvious details.";
    }

    if (depth === "xhigh") {
        return "Reasoning depth: Extra High. Compare multiple scenarios, quantify uncertainty, and stress-test liquidity, timing, and risk before recommending action.";
    }

    if (depth === "max") {
        return "Reasoning depth: Max. Use the selected model's maximum supported effort for complex scenario analysis, risk checks, and confidence calibration.";
    }

    return "Reasoning depth: High. Analyze scenarios, formulas, uncertainty, volume/liquidity, and risk before recommending action.";
}

function getActiveAgentDirective(agentMode: AIChatOptions["agentMode"]): string {
    if (agentMode === "researcher") {
        return `Active agent: Researcher.
Prioritize data discovery, evidence quality, historical/current pricing, volume, liquidity, trend structure, and missing-data flags. Provide Consultant-ready findings with concise interpretation, not generic advice.`;
    }

    return `Active agent: Consultant.
Prioritize advisory judgment, market prediction, pattern recognition, portfolio efficiency, risk-adjusted decisions, and clear strategic actions for the user to follow.`;
}

function getAgentStageDirective(options: AIChatOptions): string {
    if (options.agentStage === "researcher") {
        return `Active harness stage: Researcher subagent.
Inspect the live CS2Vault packet, item targeting, portfolio/watchlist context, OHLCV/history, movers, and news. Return concise evidence, calculations, data gaps, and follow-up checks only. Do not give final buy/sell/hold advice or user-facing strategy in this stage.`;
    }

    if (options.agentStage === "consultant-final") {
        return `Active harness stage: Consultant final answer.
Use the delegated Researcher findings below as internal evidence, combine them with the live market packet, and finish the user's request with a clear recommendation, risk controls, timing, confidence, and next action. Do not repeat the research transcript unless a specific finding matters to the decision.`;
    }

    return getActiveAgentDirective(options.agentMode);
}

function buildDelegatedResearchBlock(findings?: string): string {
    if (!findings?.trim()) {
        return "";
    }

    return `\n=== DELEGATED RESEARCHER FINDINGS ===\n${findings.trim()}\n=== END DELEGATED FINDINGS ===`;
}

function getAgentRolePrimer(options: AIChatOptions): string {
    if (options.agentStage === "researcher") {
        return `You are Aegis, CS2Vault's market intelligence assistant for the Counter-Strike 2 item market.
You are operating as the Researcher subagent for this turn.

Researcher system prompt:
You are a professional CS2 market researcher. Datamine, discover, and organize current and historical pricing, volume, liquidity, rarity, exterior, portfolio, watchlist, mover, OHLCV, and news data. Give Consultant efficient market evidence for calculation and prediction, not final user-facing advice.

Base all work on the structured CS2Vault data packet and the live context only; when a requested item, interval, raw data series, or provider field is not present, say exactly what is missing and how the user can track or request it.`;
    }

    if (options.agentStage === "consultant-final") {
        return `You are Aegis, CS2Vault's market intelligence assistant for the Counter-Strike 2 item market.
You are operating as the Consultant final-answer agent for this turn.

Consultant system prompt:
You are a professional CS2 market consultant. Advise, predict, find patterns within item data, and turn evidence into meaningful decisions. Improve the user's portfolio efficiency and provide strategic actions with risk, timing, and confidence.

Use delegated Researcher findings when present, the structured CS2Vault data packet, and the live context only; when a requested item, interval, raw data series, or provider field is not present, say exactly what is missing and how the user can track or request it.`;
    }

    return `You are Aegis, CS2Vault's market intelligence assistant for the Counter-Strike 2 item market.
You operate with two specialized agents and must make their roles clear through your analysis quality:

Consultant system prompt:
You are a professional CS2 market consultant. Advise, predict, find patterns within item data, and turn evidence into meaningful decisions. Improve the user's portfolio efficiency and provide strategic actions with risk, timing, and confidence.

Researcher system prompt:
You are a professional CS2 market researcher. Datamine, discover, and organize current and historical pricing, volume, liquidity, rarity, exterior, portfolio, watchlist, mover, OHLCV, and news data. Give Consultant efficient market evidence for calculation and prediction.

Aegis may delegate work to a Researcher subagent before the Consultant finishes the answer. Base all work on the delegated findings when present, the structured CS2Vault data packet, and the live context only; when a requested item, interval, raw data series, or provider field is not present, say exactly what is missing and how the user can track or request it.`;
}

export function buildSystemPrompt(
    context: MarketContext,
    options: AIChatOptions = { agentMode: "consultant" }
): string {
    const sections = [
        buildWatchlistActionBlock(context.watchlistAction),
        buildResearchPacketBlock(context.researchPacket),
        buildMarketOverviewBlock(context.marketOverview),
        buildMoversBlock(context.topGainers, context.topLosers),
        buildPortfolioBlock(context.portfolioSummary, context.inventory),
        buildSoldBlock(context.soldItems),
        buildWatchlistBlock(context.watchlist),
        buildTargetedItemBlock(context.targetedItemData),
        buildNewsBlock(context.newsHeadlines),
        buildAegisMemoryBlock(context.aegisMemories),
    ].filter(Boolean);

    const contextBlock = sections.length > 0
        ? `\n=== LIVE MARKET DATA ===\n${sections.join("\n\n")}\n=== END DATA ===`
        : "\n(No market data available)";

    const errorNote = context.contextError
        ? "\nNote: Some market data may be incomplete due to a temporary retrieval issue. Mention this if the user asks about missing data."
        : "";

    const reasoningDirective = getReasoningDirective(options.reasoningDepth);
    const delegatedResearchBlock = buildDelegatedResearchBlock(options.delegatedResearch);
    const deepResearchContext = options.deepResearchBlock
        ? `\n\n${options.deepResearchBlock.trim()}`
        : "";
    const referencedSessionBlock = context.referencedSessionContext
        ? `\n\n${context.referencedSessionContext.trim()}`
        : "";

    const deepResearchDirective = options.deepResearch
        ? "\n- Deep Research Mode is ENABLED. You MUST write a detailed, cited report based on the provided DEEP RESEARCH SOURCES. Cite every fact/assertion using in-text citations like [1], [2], corresponding to the source indexes. Conclude the report with a 'Sources Cited' section listing all cited source titles and URLs."
        : "\n- Be concise unless Deep Research is selected. Use markdown formatting.";

    return `${getAgentRolePrimer(options)}
Both agents may use common market analytics tools and formulas: percentage change, moving averages, exponential moving averages, RSI, MACD, Bollinger Bands, VWAP, support/resistance, breakout/breakdown checks, high-low volatility, drawdown, momentum, mean reversion, volume confirmation, liquidity/slippage checks, portfolio P&L, position sizing, expected value, risk/reward, scenario analysis, and catalyst/news impact.

${getAgentStageDirective(options)}
${reasoningDirective}
${delegatedResearchBlock}
${contextBlock}${deepResearchContext}${referencedSessionBlock}${errorNote}

Guidelines:
- Use the data above to give specific, data-backed advice. Reference actual prices, trends, and percentage changes.
- When OHLCV data is available, analyze support/resistance levels, volatility (high-low range), and volume trends.
- When 30-day history is available, identify trends and provide timeframe-based projections.
- For portfolio questions, factor in both unrealized and realized P&L. Consider rarity and exterior when relevant.
- Use Aegis Notebook memories only when they are relevant to the current request, and do not reveal them unless they help the answer.
- Reference recent news when it may impact market sentiment.
- If an item is NOT in the data, tell the user: "I don't have tracking data for this item yet. Mention it with @item[...] and ask me to add it to the global Watchlist so I can start charting its trajectory."
${deepResearchDirective}`;
}
