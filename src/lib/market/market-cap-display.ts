export interface DashboardMarketSummary {
    marketCapUsd: number | null;
    source: string;
    sampleSize?: number;
    computedAt?: string;
    status?: "ok" | "missing_key" | "no_data" | "error";
}

export interface DashboardLegacyMarketCap {
    totalMarketCap: number | null;
    itemCount?: number;
    provider: string;
    source?: string;
    status: string;
    timestamp?: string;
}

export type MarketCapPreference = "legacy_fresh" | "summary" | "legacy_stale" | "none";

function hasPositiveNumber(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function selectPreferredMarketCapSource(
    legacyMarketCap: DashboardLegacyMarketCap | null,
    marketSummary: DashboardMarketSummary | null
): MarketCapPreference {
    const hasFreshLegacy = hasPositiveNumber(legacyMarketCap?.totalMarketCap) && legacyMarketCap.status !== "stale";
    if (hasFreshLegacy) {
        return "legacy_fresh";
    }

    if (hasPositiveNumber(marketSummary?.marketCapUsd)) {
        return "summary";
    }

    if (hasPositiveNumber(legacyMarketCap?.totalMarketCap)) {
        return "legacy_stale";
    }

    return "none";
}
