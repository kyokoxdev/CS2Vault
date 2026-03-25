"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { StatCard } from "@/components/ui/StatCard";
import { TopMovers, type TopMover } from "@/components/market/TopMovers";
import styles from "./MarketOverview.module.css";
import { NewsFeed, type FeedItem } from "@/components/market/NewsFeed";
import { Card } from "@/components/ui/Card";

interface SyncLog {
  id: number;
  status: string;
  itemCount: number;
  duration: number | null;
  timestamp: string;
}

interface MarketSummary {
  marketCapUsd: number | null;
  source: string;
  sampleSize?: number;
  computedAt?: string;
  status?: "ok" | "missing_key" | "no_data" | "error";
}

export default function MarketOverview() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [watchedCount, setWatchedCount] = useState(0);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [topMovers, setTopMovers] = useState<{ gainers: TopMover[]; losers: TopMover[]; source?: string; cached?: boolean; updatedAt?: string }>({ gainers: [], losers: [] });
  const [topMoversLoading, setTopMoversLoading] = useState(true);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  const [csgotraderMarketCap, setCsgotraderMarketCap] = useState<{
    totalMarketCap: number | null;
    itemCount?: number;
    provider: string;
    source?: string;
    status: string;
  } | null>(null);

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const fetchWatchedCount = useCallback(async () => {
    try {
      const res = await fetch("/api/items?limit=1");
      const data = await res.json();
      if (data.success) {
        setWatchedCount(data.data.items.length > 0 ? data.data.total : 0);
      }
    } catch (err) {
      console.warn("Watched count fetch error:", err);
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
          cached: data.data.cached,
          updatedAt: data.data.updatedAt,
        });
      }
    } catch (err) {
      console.warn('Top movers fetch error:', err);
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
          status: data.status ?? "ok",
        });
      }
    } catch (err) {
      console.warn("Market cap fetch error:", err);
    }
  }, []);

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
    fetchWatchedCount();
    fetchSyncLogs();
    fetchMarketSummary();
    fetchTopMovers();
    fetchNewsFeed();
    fetchMarketCap();
  }, [fetchWatchedCount, fetchSyncLogs, fetchMarketSummary, fetchTopMovers, fetchNewsFeed, fetchMarketCap]);

  useEffect(() => {
    const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
    const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
    if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

    const intervalMs = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      fetchWatchedCount();
      fetchSyncLogs();
      fetchMarketSummary();
      fetchTopMovers();
      fetchNewsFeed();
      fetchMarketCap();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fetchWatchedCount, fetchSyncLogs, fetchMarketSummary, fetchTopMovers, fetchNewsFeed, fetchMarketCap]);

  const lastSync = syncLogs[0];
  
  const marketCapValue = csgotraderMarketCap?.totalMarketCap
    ? `$${csgotraderMarketCap.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : marketSummary?.marketCapUsd
      ? `$${marketSummary.marketCapUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : "N/A";
    
  const marketCapSubLabel = csgotraderMarketCap?.totalMarketCap
    ? csgotraderMarketCap.itemCount
      ? `Source: CSGOTrader CSFloat • ${csgotraderMarketCap.itemCount.toLocaleString()} items`
      : "Source: CSGOTrader CSFloat"
    : marketSummary?.marketCapUsd
      ? `Source: CSFloat${marketSummary.sampleSize ? ` \u2022 ${marketSummary.sampleSize} items` : ""}`
      : csgotraderMarketCap?.status === "no_data"
        ? "Waiting for daily calculation"
        : marketSummary?.status === "missing_key"
          ? "Set CSFLOAT_API_KEY"
          : marketSummary?.status === "error"
            ? "CSFloat unavailable"
            : "No data returned";

  return (
    <div className={styles.page}>
      <div className={styles.statsRow}>
        <Card padding="md">
          <div className={styles.statCardContent}>
            <div className={styles.statLabel}>Estimated Market Cap</div>
            <div className={styles.statValue}>{marketCapValue}</div>
            <div className={styles.statSubtext}>{marketCapSubLabel}</div>
          </div>
        </Card>
        
        <StatCard
          label="Watched"
          value={watchedCount}
        />
        
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
          />
        )}
        
        <Card padding="md">
          <div className={styles.statCardContent}>
            <div className={styles.statLabel}>Last Sync</div>
            <div className={styles.statValueSmall}>
               {lastSync
                  ? new Date(lastSync.timestamp).toLocaleTimeString()
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
        cached={topMovers.cached}
        updatedAt={topMovers.updatedAt}
        isLoading={topMoversLoading}
      />

      <NewsFeed items={feedItems} isLoading={feedLoading} />
    </div>
  );
}
