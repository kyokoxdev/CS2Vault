"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FaTimes, FaPlus, FaSpinner, FaSyncAlt } from "react-icons/fa";
import { WatchlistTable, type Item } from "@/components/market/WatchlistTable";
import { AddItemPanel } from "@/components/market/AddItemPanel";
import { FallbackToast } from "@/components/ui/FallbackToast";
import { useToast } from "@/components/providers/ToastProvider";
import styles from "./Watchlist.module.css";

export default function WatchlistPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [fallbackInfo, setFallbackInfo] = useState<{
    failureReason: string;
    attemptedProvider: string;
  } | null>(null);
  const initialSyncRef = useRef(false);

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setItemsLoading(true);
      const res = await fetch("/api/items?limit=100");
      const data = await res.json();

      if (data.success) {
        setItems(data.data.items);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const handleRefreshPrices = useCallback(async (fallback?: string) => {
    setSyncing(true);
    setSyncStatus("Refreshing prices...");
    try {
      const url = fallback
        ? `/api/watchlist/prices?fallback=${fallback}`
        : "/api/watchlist/prices";
      const start = performance.now();
      const res = await fetch(url, { method: "POST" });
      const elapsed = Math.round(performance.now() - start);
      const data = await res.json();
      if (data.success) {
        setSyncStatus(
          `Refreshed ${data.data.itemCount} items in ${elapsed}ms`
        );
        setTimeout(() => setSyncStatus(""), 3000);
        fetchData(false);

        if (data.data?.fallbackAvailable && data.data?.failureReason) {
          setFallbackInfo({
            failureReason: data.data.failureReason,
            attemptedProvider: data.data.attemptedProvider ?? "unknown",
          });
        }
      } else {
        setSyncStatus(`Failed: ${data.error}`);
        setTimeout(() => setSyncStatus(""), 5000);
      }
    } catch (err) {
      setSyncStatus(`Error: ${err}`);
      setTimeout(() => setSyncStatus(""), 5000);
    }
    setSyncing(false);
  }, [fetchData]);

  useEffect(() => {
    if (initialSyncRef.current) return;
    initialSyncRef.current = true;
    handleRefreshPrices();
  }, [handleRefreshPrices]);

  useEffect(() => {
    const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
    const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
    if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

    const intervalMs = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      handleRefreshPrices();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [handleRefreshPrices]);

  async function handleAddItem(selected: {
    hashName: string;
    name: string;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
  }) {
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
        addToast(`Added "${data.data.name}" to watchlist`, "success");
        fetchData();
      } else {
        addToast(data.error, "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
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

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h3 className={styles.toolbarTitle}>Your Watchlist</h3>
        <div className={styles.toolbarActions}>
          {syncStatus && (
            <span className={styles.statusMessage}>
              {syncStatus}
            </span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? <>
              <FaTimes style={{ fontSize: '0.875rem', marginRight: '4px' }} />
              Cancel
            </> : <>
              <FaPlus style={{ fontSize: '0.875rem', marginRight: '4px' }} />
              Add Item
            </>}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleRefreshPrices()}
            disabled={syncing}
          >
            {syncing ? <>
              <FaSpinner style={{ fontSize: '0.875rem', marginRight: '4px', animation: 'spin 1s linear infinite' }} />
              Refreshing...
            </> : <>
              <FaSyncAlt style={{ fontSize: '0.875rem', marginRight: '4px' }} />
              Refresh Prices
            </>}
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddItemPanel onAdd={handleAddItem} status="" />
      )}

      <div className={styles.tableContainer}>
        {itemsLoading ? (
          <div className={styles.loadingState}>Loading watchlist...</div>
        ) : (
          <WatchlistTable 
            items={items} 
            onToggleWatch={handleToggleWatch}
          />
        )}
      </div>

      {fallbackInfo && (
        <FallbackToast
          failureReason={fallbackInfo.failureReason}
          attemptedProvider={fallbackInfo.attemptedProvider}
          onApprove={() => {
            setFallbackInfo(null);
            handleRefreshPrices("steam");
          }}
          onDismiss={() => setFallbackInfo(null)}
        />
      )}
    </div>
  );
}
