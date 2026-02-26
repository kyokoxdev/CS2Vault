"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/ui/StatCard";
import { WatchlistTable, type Item } from "@/components/market/WatchlistTable";
import { AddItemPanel } from "@/components/market/AddItemPanel";
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
  const [items, setItems] = useState<Item[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [topMovers, setTopMovers] = useState<{ gainers: TopMover[]; losers: TopMover[] }>({ gainers: [], losers: [] });
  const [topMoversLoading, setTopMoversLoading] = useState(true);

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  // Add item state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStatus, setAddStatus] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, syncRes] = await Promise.all([
        fetch("/api/items?limit=100"),
        fetch("/api/sync"),
      ]);
      const itemsData = await itemsRes.json();
      const syncData = await syncRes.json();

      if (itemsData.success) {
        setItems(itemsData.data.items);
      }
      if (syncData.success) {
        setSyncLogs(syncData.data.logs);
      }
    } catch (err) {
      console.error("Fetch error:", err);
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
        setTopMovers({ gainers: data.data.gainers, losers: data.data.losers });
      }
    } catch (err) {
      console.warn('Top movers fetch error:', err);
    } finally {
      setTopMoversLoading(false);
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

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncStatus("Syncing...");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncStatus(
          `Synced ${data.data.itemCount} items in ${data.data.duration}ms`
        );
        fetchData();
      } else {
        setSyncStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`Error: ${err}`);
    }
    setSyncing(false);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    fetchMarketSummary();
    fetchTopMovers();
    fetchNewsFeed();
  }, [fetchData, fetchMarketSummary, fetchTopMovers, fetchNewsFeed]);

  useEffect(() => {
    const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
    const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
    if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

    const intervalMs = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      handleSync();
      fetchMarketSummary();
      fetchTopMovers();
      fetchNewsFeed();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fetchMarketSummary, handleSync, fetchTopMovers, fetchNewsFeed]);

  useEffect(() => {
    const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
    const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
    if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

    const intervalMs = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      handleSync();
      fetchMarketSummary();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fetchMarketSummary, handleSync]);

  const router = useRouter();




  async function handleAddItem(selected: {
    hashName: string;
    name: string;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
  }) {
    setAddStatus("Adding...");
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketHashName: selected.hashName,
          name: selected.name,
          category: selected.category,
          type: selected.type ?? undefined,
          rarity: selected.rarity ?? undefined,
          exterior: selected.exterior ?? undefined,
          isWatched: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAddStatus(`✅ Added "${data.data.name}" to watchlist`);
        fetchData();
        setTimeout(() => setAddStatus(""), 3000);
      } else {
        setAddStatus(`❌ ${data.error}`);
        setTimeout(() => setAddStatus(""), 5000);
      }
    } catch (err) {
      setAddStatus(`❌ ${err}`);
      setTimeout(() => setAddStatus(""), 5000);
    }
  }

  async function handleToggleWatch(id: string, current: boolean) {
    try {
      await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatched: !current }),
      });
      fetchData();
    } catch (err) {
      console.error("Toggle error:", err);
    }
  }

  const watchedCount = items.filter((i) => i.isWatched).length;
  const lastSync = syncLogs[0];
  const totalValue = items.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0),
    0
  );
  
  const marketCapValue = marketSummary?.marketCapUsd
    ? `$${marketSummary.marketCapUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "N/A";
    
  const marketCapSubLabel = marketSummary?.marketCapUsd
    ? `Source: CSFloat${marketSummary.sampleSize ? ` • ${marketSummary.sampleSize} items` : ""}`
    : marketSummary?.status === "missing_key"
      ? "Set CSFLOAT_API_KEY"
      : marketSummary?.status === "error"
        ? "CSFloat unavailable"
        : "No data returned";

  return (
    <div className={styles.page}>
      {/* Stats Grid */}
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
        
        <StatCard
          label="Portfolio Value"
          value={totalValue.toFixed(2)}
          prefix="$"
        />
        
        <Card padding="md">
          <div className={styles.statCardContent}>
            <div className={styles.statLabel}>Last Sync</div>
            <div className={styles.statValueSmall}>
               {lastSync
                  ? new Date(lastSync.timestamp).toLocaleTimeString()
                  : "Never"}
            </div>
            <div className={styles.statSubtext}>
               {lastSync ? `${lastSync.itemCount} items • ${lastSync.duration}ms` : ""}
            </div>
          </div>
        </Card>
      </div>

      {/* Top Movers */}
      <TopMovers gainers={topMovers.gainers} losers={topMovers.losers} isLoading={topMoversLoading} />

      {/* News Feed */}
      <NewsFeed items={feedItems} isLoading={feedLoading} />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <h3 className={styles.toolbarTitle}>Watchlist</h3>
        <div className={styles.toolbarActions}>
          {syncStatus && (
            <span className={styles.statusMessage}>
              {syncStatus}
            </span>
          )}
          {addStatus && (
            <span className={styles.statusMessage}>
              {addStatus}
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "✕ Cancel" : "＋ Add Item"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync Now"}
          </button>
        </div>
      </div>

      {/* Add Item Panel */}
      {showAddForm && (
        <AddItemPanel onAdd={handleAddItem} status={addStatus} />
      )}

      {/* Items Table */}
      <WatchlistTable 
        items={items} 
        onToggleWatch={handleToggleWatch}

      />
    </div>
  );
}
