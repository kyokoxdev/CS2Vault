"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { StatCard } from "@/components/ui/StatCard";
import type { TopMover } from "@/components/market/TopMovers";
import styles from "./MarketOverview.module.css";
import type { FeedItem } from "@/components/market/NewsFeed";
import { Card } from "@/components/ui/Card";
import {
  selectPreferredMarketCapSource,
  type DashboardLegacyMarketCap,
  type DashboardMarketSummary,
} from "@/lib/market/market-cap-display";
import { usePriceRefreshInterval } from "@/hooks/usePriceRefreshInterval";

const TopMovers = dynamic(
  () => import("@/components/market/TopMovers").then((m) => ({ default: m.TopMovers })),
  { ssr: false }
);

const NewsFeed = dynamic(
  () => import("@/components/market/NewsFeed").then((m) => ({ default: m.NewsFeed })),
  { ssr: false }
);

interface SyncLog {
  id: number;
  status: string;
  itemCount: number;
  duration: number | null;
  timestamp: string;
}

export default function MarketOverview() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [watchlistPerf, setWatchlistPerf] = useState<{ avg24h: number | null; count: number }>({ avg24h: null, count: 0 });
  const [marketSummary, setMarketSummary] = useState<DashboardMarketSummary | null>(null);
  const [topMovers, setTopMovers] = useState<{ gainers: TopMover[]; losers: TopMover[]; source?: string }>({ gainers: [], losers: [] });
  const [topMoversLoading, setTopMoversLoading] = useState(true);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [portfolioChange24h, setPortfolioChange24h] = useState<number | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  const [csgotraderMarketCap, setCsgotraderMarketCap] = useState<DashboardLegacyMarketCap | null>(null);

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const priceRefreshIntervalMin = usePriceRefreshInterval();

  const fetchWatchlistPerformance = useCallback(async () => {
    try {
      const res = await fetch("/api/items?limit=200");
      const data = await res.json();
      if (data.success) {
        const items = data.data.items as Array<{ priceChange24h: number | null }>;
        const withChange = items.filter((i) => i.priceChange24h !== null);
        const avg = withChange.length > 0
          ? withChange.reduce((sum, i) => sum + (i.priceChange24h ?? 0), 0) / withChange.length
          : null;
        setWatchlistPerf({ avg24h: avg, count: data.data.total });
      }
    } catch (err) {
      console.warn("Watchlist performance fetch error:", err);
    }
  }, []);

  const fetchSyncLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      if (data.success) {
        setSyncLogs(data.data.logs);
      }
    } catch (err) {
      console.warn("Sync logs fetch error:", err);
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
      setError("Failed to load market data. Check your connection and try again.");
    }
  }, []);

  const fetchTopMovers = useCallback(async () => {
    try {
      const res = await fetch('/api/market/top-movers');
      const data = await res.json();
      if (data.success) {
        setTopMovers({
          gainers: data.data.gainers,
          losers: data.data.losers,
          source: data.data.source,
        });
      }
    } catch (err) {
      console.warn('Top movers fetch error:', err);
      setError("Failed to load top movers. Check your connection and try again.");
    } finally {
      setTopMoversLoading(false);
    }
  }, []);

  const fetchPortfolioValue = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      if (data.success && data.data?.totalCurrentValue !== undefined) {
        setPortfolioValue(data.data.totalCurrentValue);
        setPortfolioChange24h(data.data.change24hPercent ?? null);
      }
    } catch (err) {
      console.warn('Portfolio fetch error:', err);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const fetchNewsFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/market/news-feed?limit=20");
      const data = await res.json();
      if (data.success) {
        setFeedItems(data.data.items);
      }
    } catch (err) {
      console.warn("News feed fetch error:", err);
      setError("Failed to load news feed. Check your connection and try again.");
    } finally {
      setFeedLoading(false);
    }
  }, []);

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

  const retryFetches = useCallback(() => {
    setError(null);
    fetchMarketSummary();
    fetchTopMovers();
    fetchNewsFeed();
    fetchMarketCap();
  }, [fetchMarketSummary, fetchTopMovers, fetchNewsFeed, fetchMarketCap]);

  const { status: authStatus } = useSession();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      setPortfolioLoading(false);
      return;
    }
    if (authStatus === 'authenticated') {
      fetchPortfolioValue();
    }
  }, [authStatus, fetchPortfolioValue]);

  useEffect(() => {
    fetchWatchlistPerformance();
    fetchSyncLogs();
    fetchMarketSummary();
    fetchTopMovers();
    fetchNewsFeed();
    fetchMarketCap();
  }, [fetchWatchlistPerformance, fetchSyncLogs, fetchMarketSummary, fetchTopMovers, fetchNewsFeed, fetchMarketCap]);

  useEffect(() => {
    if (!Number.isFinite(priceRefreshIntervalMin) || priceRefreshIntervalMin <= 0) return;

    const intervalMs = priceRefreshIntervalMin * 60 * 1000;
    const timer = setInterval(() => {
      fetchWatchlistPerformance();
      fetchSyncLogs();
      fetchMarketSummary();
      fetchTopMovers();
      fetchNewsFeed();
      fetchMarketCap();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fetchWatchlistPerformance, fetchSyncLogs, fetchMarketSummary, fetchTopMovers, fetchNewsFeed, fetchMarketCap, priceRefreshIntervalMin]);

  const lastSync = syncLogs[0];

  const getRelativeTime = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  const isStale = lastSync
    ? (Date.now() - new Date(lastSync.timestamp).getTime()) > (priceRefreshIntervalMin ?? 15) * 60 * 1000
    : false;
  const marketCapPreference = selectPreferredMarketCapSource(csgotraderMarketCap, marketSummary);
  const staleLegacyTimestamp = csgotraderMarketCap?.timestamp
    ? new Date(csgotraderMarketCap.timestamp).toLocaleString()
    : null;
  
  const marketCapValue = marketCapPreference === "legacy_fresh" && csgotraderMarketCap?.totalMarketCap
    ? `$${csgotraderMarketCap.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : marketCapPreference === "summary" && marketSummary?.marketCapUsd
      ? `$${marketSummary.marketCapUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : marketCapPreference === "legacy_stale" && csgotraderMarketCap?.totalMarketCap
        ? `$${csgotraderMarketCap.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : "N/A";
    
  const marketCapSubLabel = marketCapPreference === "legacy_fresh"
    ? csgotraderMarketCap?.itemCount
      ? `Source: CSGOTrader CSFloat • ${csgotraderMarketCap.itemCount.toLocaleString()} items`
      : "Source: CSGOTrader CSFloat"
    : marketCapPreference === "summary"
      ? `Source: CSFloat${marketSummary?.sampleSize ? ` \u2022 ${marketSummary.sampleSize} items` : ""}`
      : marketCapPreference === "legacy_stale"
        ? staleLegacyTimestamp
          ? `Stale CSGOTrader snapshot from ${staleLegacyTimestamp}`
          : "Stale CSGOTrader snapshot — waiting for recalculation"
        : csgotraderMarketCap?.status === "no_data"
          ? "Waiting for daily calculation"
          : marketSummary?.status === "missing_key"
            ? "Set CSFLOAT_API_KEY"
            : marketSummary?.status === "error"
              ? "CSFloat unavailable"
              : "No data returned";

  return (
    <div className={styles.page}>
      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorMessage}>{error}</span>
          <button type="button" className={styles.errorRetryBtn} onClick={retryFetches}>
            Retry
          </button>
        </div>
      )}
      <div className={styles.statsRow}>
        <StatCard
          label="Estimated Market Cap"
          value={
            <>
              {marketCapValue}
              <div className={styles.statSubtext}>{marketCapSubLabel}</div>
            </>
          }
        />
        
        <Link href="/watchlist" className={styles.statCardLink}>
          <StatCard
            label="Watchlist 24h"
            value={
              <>
                {watchlistPerf.count} items
                {watchlistPerf.avg24h === null && watchlistPerf.count > 0 && (
                  <div className={styles.statSubtext}>No price data yet</div>
                )}
                {watchlistPerf.count === 0 && (
                  <div className={styles.statSubtext}>Start tracking items</div>
                )}
              </>
            }
            change={watchlistPerf.avg24h ?? undefined}
          />
        </Link>
        
        {authStatus === "unauthenticated" ? (
          <Card padding="md">
            <div className={styles.statCardContent}>
              <div className={styles.statLabel}>Portfolio Value</div>
              <div className={styles.statValue}>Login required</div>
            </div>
          </Card>
        ) : portfolioLoading ? (
          <Card padding="md">
            <div className={styles.statCardContent}>
              <div className={styles.statLabel}>Portfolio Value</div>
              <div className={styles.statValue}>Loading...</div>
            </div>
          </Card>
        ) : (
          <StatCard
            label="Portfolio Value"
            value={portfolioValue ? portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
            prefix="$"
            change={portfolioChange24h ?? undefined}
          />
        )}
        
        <Card padding="md">
          <div className={styles.statCardContent}>
            <div className={styles.statLabel}>Last Updated</div>
            <div className={`${styles.statValueSmall}${isStale ? ` ${styles.statValueStale}` : ''}`}>
               {lastSync
                  ? getRelativeTime(lastSync.timestamp)
                  : "Never"}
            </div>
            <div className={styles.statSubtext}>
               {lastSync ? `${lastSync.itemCount} items • ${lastSync.duration != null ? lastSync.duration + 'ms' : '—'}` : ""}
            </div>
          </div>
        </Card>
      </div>

      <TopMovers
        gainers={topMovers.gainers}
        losers={topMovers.losers}
        source={topMovers.source}
        isLoading={topMoversLoading}
      />

      <NewsFeed items={feedItems} isLoading={feedLoading} />
    </div>
  );
}
