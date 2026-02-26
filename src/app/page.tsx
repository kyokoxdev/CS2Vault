"use client";

/**
 * Market Overview Page (Home)
 *
 * Shows:
 * - Stats summary (total items, watched, last sync)
 * - Add item via search autocomplete
 * - Watchlist table with live prices + actions
 * - Quick sync button
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ItemSearch from "@/components/ui/ItemSearch";

interface Item {
  id: string;
  marketHashName: string;
  name: string;
  category: string;
  type: string | null;
  rarity: string | null;
  exterior: string | null;
  isWatched: boolean;
  currentPrice: number | null;
  priceSource: string | null;
  lastUpdated: string | null;
}

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
  }, [fetchData, fetchMarketSummary]);

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

  async function handleAddItem(selected: { hashName: string; name: string; category: string; rarity: string | null; exterior: string | null; type: string | null }) {
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
  const marketCapLabel = marketSummary?.marketCapUsd
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
    <>
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Estimated Market Cap</div>
          <div className="stat-value">{marketCapLabel}</div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>
            {marketCapSubLabel}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Watched</div>
          <div className="stat-value">{watchedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>
            ${totalValue.toFixed(2)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Sync</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {lastSync
              ? new Date(lastSync.timestamp).toLocaleTimeString()
              : "Never"}
          </div>
          <div className="stat-change" style={{ color: "var(--text-muted)" }}>
            {lastSync ? `${lastSync.itemCount} items • ${lastSync.duration}ms` : ""}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Watchlist</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {syncStatus && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {syncStatus}
            </span>
          )}
          {addStatus && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
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

      {/* Add Item — Search Autocomplete */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 16, overflow: "visible" }}>
          <div className="card-body" style={{ overflow: "visible" }}>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Search Steam Market to add items
              </label>
            </div>
            <ItemSearch
              onSelect={handleAddItem}
              placeholder="Type to search... e.g. AK-47 Redline, AWP Dragon Lore"
            />
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Weapon Type</th>
              <th>Rarity</th>
              <th>Price</th>
              <th>Source</th>
              <th>Updated</th>
              <th>Status</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link
                    href={`/item/${item.id}`}
                    style={{ fontWeight: 500, color: "var(--text-primary)" }}
                  >
                    {item.name}
                  </Link>
                  <br />
                  <small style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {item.marketHashName}
                  </small>
                </td>
                <td style={{ textTransform: "capitalize" }}>{item.category}</td>
                <td>
                  {item.category === "weapon" && item.type ? (
                    <span className="badge badge-gray">{item.type}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
                <td>
                  {item.rarity ? (
                    <span className="badge badge-green">{item.rarity}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: item.currentPrice
                      ? "var(--green)"
                      : "var(--text-muted)",
                  }}
                >
                  {item.currentPrice ? `$${item.currentPrice.toFixed(2)}` : "—"}
                </td>
                <td style={{ textTransform: "uppercase", fontSize: 11 }}>
                  {item.priceSource ?? "—"}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {item.lastUpdated
                    ? new Date(item.lastUpdated).toLocaleString()
                    : "—"}
                </td>
                <td>
                  {item.isWatched ? (
                    <span className="badge badge-green">Watching</span>
                  ) : (
                    <span className="badge badge-red">Unwatched</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleToggleWatch(item.id, item.isWatched)}
                      title="Remove from watchlist"
                    >
                      Unwatch
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--text-muted)",
                  }}
                >
                  No items yet. Click &quot;＋ Add Item&quot; above to search and add CS2 items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
