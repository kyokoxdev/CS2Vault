import type { MarketSource } from "@/types";

const MARKET_SOURCES: readonly MarketSource[] = ["pricempire", "csfloat", "csgotrader", "steam"];

export function isMarketSource(value: string | null | undefined): value is MarketSource {
    return value !== null && value !== undefined && MARKET_SOURCES.includes(value as MarketSource);
}

export function resolveMarketSource(
    value: string | null | undefined,
    fallback: MarketSource = "csfloat"
): MarketSource {
    return isMarketSource(value) ? value : fallback;
}
