"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { StatCard } from "@/components/ui/StatCard";
import {
    selectPreferredMarketCapSource,
    type DashboardLegacyMarketCap,
    type DashboardMarketSummary,
} from "@/lib/market/market-cap-display";
import styles from "./MarketCap.module.css";

const MarketCapChart = dynamic(
    () => import("@/components/charts/MarketCapChart"),
    { ssr: false }
);

export default function MarketCapPage() {
    const [csgotraderMarketCap, setCsgotraderMarketCap] = useState<DashboardLegacyMarketCap | null>(null);
    const [marketSummary, setMarketSummary] = useState<DashboardMarketSummary | null>(null);

    const fetchMarketCap = useCallback(async () => {
        try {
            const res = await fetch("/api/market/market-cap");
            const data = await res.json();
            if (data.success) {
                setCsgotraderMarketCap({
                    totalMarketCap: data.data?.totalMarketCap ?? null,
                    itemCount: data.data?.itemCount,
                    provider: data.data?.provider ?? "csgotrader-csfloat",
                    source: data.data?.source,
                    timestamp: data.data?.timestamp,
                    status: data.status ?? "ok",
                });
            }
        } catch (err) {
            console.warn("Market cap fetch error:", err);
        }
    }, []);

    const fetchMarketSummary = useCallback(async () => {
        try {
            const res = await fetch("/api/market/summary");
            const data = await res.json();
            if (data.success) {
                setMarketSummary(data.data);
            }
        } catch (err) {
            console.warn("Market summary fetch error:", err);
        }
    }, []);

    useEffect(() => {
        fetchMarketCap();
        fetchMarketSummary();
    }, [fetchMarketCap, fetchMarketSummary]);

    const marketCapPreference = selectPreferredMarketCapSource(csgotraderMarketCap, marketSummary);

    const currentValue = marketCapPreference === "legacy_fresh" && csgotraderMarketCap?.totalMarketCap
        ? csgotraderMarketCap.totalMarketCap
        : marketCapPreference === "summary" && marketSummary?.marketCapUsd
            ? marketSummary.marketCapUsd
            : marketCapPreference === "legacy_stale" && csgotraderMarketCap?.totalMarketCap
                ? csgotraderMarketCap.totalMarketCap
                : null;

    const sourceLabel = marketCapPreference === "legacy_fresh"
        ? "CSGOTrader CSFloat"
        : marketCapPreference === "summary"
            ? "CSFloat Live"
            : marketCapPreference === "legacy_stale"
                ? "CSGOTrader (Stale)"
                : "N/A";

    const itemCount = marketCapPreference === "legacy_fresh" || marketCapPreference === "legacy_stale"
        ? csgotraderMarketCap?.itemCount ?? null
        : marketCapPreference === "summary"
            ? marketSummary?.sampleSize ?? null
            : null;

    const lastUpdated = csgotraderMarketCap?.timestamp
        ? new Date(csgotraderMarketCap.timestamp).toLocaleString()
        : null;

    return (
        <div className={styles.page}>
            <div className={styles.statsRow}>
                <StatCard
                    label="Current Market Cap"
                    value={currentValue
                        ? `$${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "N/A"
                    }
                />
                <StatCard
                    label="Source"
                    value={sourceLabel}
                />
                <StatCard
                    label="Items Tracked"
                    value={itemCount ? itemCount.toLocaleString() : "N/A"}
                />
                <StatCard
                    label="Last Updated"
                    value={lastUpdated ?? "Never"}
                />
            </div>

            <MarketCapChart height={450} />
        </div>
    );
}
