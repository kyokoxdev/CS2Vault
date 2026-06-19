/**
 * Aegis slash-command definitions, parser, and prompt builders.
 *
 * Commands:
 *   /analyze  <item>   — deep research paper on an item
 *   /compare  <items>  — quick price & liquidity comparison
 *   /watch    <item>   — add item to watchlist (handled client-side via API)
 *   /portfolio         — portfolio review with verdict
 */

export interface SlashCommand {
    name: string;
    description: string;
    /** Whether this command expects item argument(s) that should trigger autocomplete */
    expectsItem: boolean;
    /** Whether this command is handled client-side (no AI call, returns inline result) */
    clientHandled: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    {
        name: "/analyze",
        description: "Deep research on an item — price trend, liquidity, risk, verdict",
        expectsItem: true,
        clientHandled: false,
    },
    {
        name: "/compare",
        description: "Compare prices & liquidity of two or more items side-by-side",
        expectsItem: true,
        clientHandled: false,
    },
    {
        name: "/watch",
        description: "Instantly add an item to your Watchlist",
        expectsItem: true,
        clientHandled: true,
    },
    {
        name: "/portfolio",
        description: "Full portfolio review with buy/sell/hold verdict",
        expectsItem: false,
        clientHandled: false,
    },
];

export type SlashCommandName = "/analyze" | "/compare" | "/watch" | "/portfolio";

export interface ParsedSlashCommand {
    command: SlashCommandName;
    args: string;
    /** Raw original input value */
    raw: string;
}

const SLASH_COMMAND_REGEX = /^(\/analyze|\/compare|\/watch|\/portfolio)\s*([\s\S]*)$/i;

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
    const trimmed = input.trim();
    const match = trimmed.match(SLASH_COMMAND_REGEX);
    if (!match) return null;
    const command = match[1].toLowerCase() as SlashCommandName;
    const args = (match[2] ?? "").trim();
    return { command, args, raw: trimmed };
}

/**
 * Return true when the input starts with / and is currently showing the
 * command palette (i.e. no space + word yet).
 */
export function isShowingCommandPalette(input: string): boolean {
    return input.startsWith("/") && !input.includes(" ") && input.length > 0;
}

/**
 * Return the command token typed so far (e.g. "/ana" → "/ana").
 * Used to filter the palette.
 */
export function getCommandPrefix(input: string): string {
    if (!input.startsWith("/")) return "";
    const spaceIdx = input.indexOf(" ");
    return spaceIdx === -1 ? input : input.slice(0, spaceIdx);
}

/**
 * Return the item search query for item-based commands after the command token
 * and after any @item[...] mention, so we can show fresh autocomplete.
 */
export function getItemSearchQuery(input: string): string | null {
    const parsed = parseSlashCommand(input);
    if (!parsed) return null;
    if (!["analyze", "compare", "watch"].some((c) => parsed.command === `/${c}`)) {
        return null;
    }
    // Strip any already-completed @item[...] mentions; search on remaining text
    const withoutMentions = parsed.args.replace(/@item\[[^\]]*\]/g, "").trim();
    return withoutMentions.length >= 1 ? withoutMentions : null;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

export function buildAnalyzePrompt(args: string): string {
    return [
        `Please write a comprehensive market research paper on: **${args}**`,
        "",
        "Structure your report exactly as follows:",
        "1. **Executive Summary** — one-paragraph verdict (buy / hold / sell) with price target",
        "2. **Item Profile** — category, rarity, exterior, typical supply/demand dynamics",
        "3. **Price History Analysis** — trend direction, key support & resistance levels, recent momentum",
        "4. **Liquidity & Volume** — average daily volume, bid-ask spread, market depth assessment",
        "5. **Risk Factors** — volatility, case-opening events, game updates, seasonal trends",
        "6. **Comparable Items** — 2–3 items in the same tier with relative valuation",
        "7. **Final Verdict** — clear recommended action with a 30-day price scenario",
        "",
        "Use all available market context (OHLCV, watchlist, top movers, portfolio). Be specific with numbers.",
    ].join("\n");
}

export function buildComparePrompt(args: string): string {
    return [
        `Please compare the following CS2 items: **${args}**`,
        "",
        "For each item provide:",
        "- Current price and 24h / 7d / 30d change",
        "- Liquidity score (volume, listings, bid-ask spread)",
        "- Volatility rating (low / medium / high)",
        "- Supply/demand outlook",
        "",
        "Then produce a **side-by-side comparison table** followed by a recommendation on which item offers the best value right now and why.",
    ].join("\n");
}

export function buildPortfolioPrompt(): string {
    return [
        "Please perform a full review of my CS2Vault portfolio.",
        "",
        "Cover these sections:",
        "1. **Portfolio Snapshot** — total value, unrealized P&L, realized P&L, item count",
        "2. **Top Performers** — best P&L items, momentum leaders",
        "3. **Underperformers** — items bleeding value or with poor liquidity",
        "4. **Risk Assessment** — concentration risk, over-exposure to one category",
        "5. **Actionable Verdict** — for each position: Buy more / Hold / Trim / Sell",
        "6. **Next Steps** — top 3 priority actions I should take this week",
        "",
        "Use the full portfolio context, inventory, realized/unrealized P&L, and current market prices. Be direct and specific.",
    ].join("\n");
}
