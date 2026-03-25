"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import styles from "./Portfolio.module.css";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FallbackToast } from "@/components/ui/FallbackToast";

interface PortfolioItem {
  id: string;
  assetId: string;
  name: string;
  marketHashName: string;
  category: string;
  type: string | null;
  rarity: string | null;
  exterior: string | null;
  imageUrl: string | null;
  currentPrice: number;
  acquiredPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  floatValue: number | null;
  wearQuality: string | null;
  acquiredAt: string;
}

interface PortfolioData {
  totalCurrentValue: number;
  totalAcquiredValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  itemCount: number;
  filteredCount?: number;
  items: PortfolioItem[];
  filteredTotals?: {
    totalCurrentValue: number;
    totalAcquiredValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
  };
  filter?: {
    category: string | null;
    rarity: string | null;
    search: string | null;
    price: string | null;
  };
  filterOptions?: {
    categories: string[];
    rarities: string[];
  };
}

const RARITY_VARIANTS: Record<string, string> = {
  "Contraband": "contraband",
  "Covert": "covert",
  "Classified": "classified",
  "Restricted": "restricted",
  "Mil-Spec": "milspec",
  "Industrial Grade": "industrial",
  "Consumer Grade": "consumer",
  "Base Grade": "consumer",
  "Distinguished": "milspec",
  "Exceptional": "restricted",
  "Superior": "classified",
  "Master": "covert",
  "High Grade": "milspec",
  "Remarkable": "restricted",
  "Exotic": "classified",
  "Extraordinary": "covert",
};

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [fallbackInfo, setFallbackInfo] = useState<{
    failureReason: string;
    attemptedProvider: string;
    source: "sync" | "prices";
  } | null>(null);
  const [priceRefreshIntervalMin, setPriceRefreshIntervalMin] = useState(15);
  const refreshRef = useRef<((fallback?: string) => Promise<void>) | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (rarityFilter) params.set("rarity", rarityFilter);
      if (searchFilter) params.set("search", searchFilter);
      if (priceFilter && priceFilter !== "all") params.set("price", priceFilter);
      const res = await fetch(`/api/portfolio?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch portfolio:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, rarityFilter, searchFilter, priceFilter]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleSync = useCallback(async (fallback?: string) => {
    setSyncing(true);
    setSyncStatus("Fetching inventory from Steam...");
    try {
      const url = fallback ? `/api/inventory?fallback=${fallback}` : "/api/inventory";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const coverage = data.data?.priceCoverage;
        const limited = data.data?.priceLimitedTo;
        const limitLabel = limited ? ` (limited to ${limited})` : "";
        const coverageLabel = coverage
          ? ` • Priced ${coverage.priced}/${coverage.total}${limitLabel}`
          : "";
        setSyncStatus(`[OK] Synced ${data.data.synced} items from Steam${coverageLabel}`);
        await fetchPortfolio();

        if (data.data?.fallbackAvailable && data.data?.failureReason) {
          setFallbackInfo({
            failureReason: data.data.failureReason,
            attemptedProvider: data.data.attemptedProvider ?? "unknown",
            source: "sync",
          });
        }
      } else {
        setSyncStatus(`[ERR] ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`[ERR] ${err}`);
    }
    setSyncing(false);
  }, [fetchPortfolio]);

  const handleRefreshPrices = useCallback(async (fallback?: string) => {
    setRefreshingPrices(true);
    setSyncStatus("Refreshing prices...");
    try {
      const url = fallback ? `/api/portfolio/prices?fallback=${fallback}` : "/api/portfolio/prices";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const limited = data.data?.priceLimitedTo;
        const limitLabel = limited ? ` (limited to ${limited})` : "";
        setSyncStatus(`[OK] Refreshed prices for ${data.data.pricedCount ?? 0} items${limitLabel}`);
        await fetchPortfolio();

        if (data.data?.fallbackAvailable && data.data?.failureReason) {
          setFallbackInfo({
            failureReason: data.data.failureReason,
            attemptedProvider: data.data.attemptedProvider ?? "unknown",
            source: "prices",
          });
        }
      } else {
        setSyncStatus(`[ERR] ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`[ERR] ${err}`);
    }
    setRefreshingPrices(false);
  }, [fetchPortfolio]);

  refreshRef.current = handleRefreshPrices;

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.priceRefreshIntervalMin) {
          setPriceRefreshIntervalMin(data.priceRefreshIntervalMin);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (priceRefreshIntervalMin <= 0) return;

    const intervalMs = priceRefreshIntervalMin * 60 * 1000;
    const timer = setInterval(() => {
      refreshRef.current?.();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [priceRefreshIntervalMin]);

  const handleUpdatePrice = useCallback(async (itemId: string) => {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) return;

    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquiredPrice: price }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditPrice("");
        await fetchPortfolio();
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
  }, [editPrice, fetchPortfolio]);

  const handleFilterChange = (field: string, value: string) => {
    switch (field) {
      case "category":
        setCategoryFilter(value);
        break;
      case "rarity":
        setRarityFilter(value);
        break;
      case "search":
        setSearchFilter(value);
        break;
      case "price":
        setPriceFilter(value);
        break;
    }
  };

  const handleClearFilters = () => {
    setCategoryFilter("");
    setRarityFilter("");
    setSearchFilter("");
    setPriceFilter("all");
  };

  const columns = useMemo<Column<PortfolioItem>[]>(() => [
    {
      key: "name",
      header: "Item",
      render: (_, item) => (
        <div className={styles.itemCell}>
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className={styles.itemImage}
            />
          )}
          <div>
            <div className={styles.itemName}>{item.name}</div>
            {item.exterior && (
              <div className={styles.itemExterior}>
                {item.exterior}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (_, item) => (
        <span className={styles.categoryCell}>
          <span className={styles.categoryName}>
            {item.category.replace("_", " ")}
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Weapon Type",
      render: (_, item) =>
        item.category === "weapon" && item.type ? (
          <span className={styles.typeCell}>{item.type}</span>
        ) : (
          <span className={styles.textMuted}>—</span>
        ),
    },
    {
      key: "rarity",
      header: "Rarity",
      render: (_, item) =>
        item.rarity ? (
          <Badge variant={RARITY_VARIANTS[item.rarity] || "neutral"} size="sm">
            {item.rarity}
          </Badge>
        ) : (
          <span className={styles.textMuted}>—</span>
        ),
    },
    {
      key: "wearQuality",
      header: "Wear",
      render: (_, item) =>
        item.category === "weapon" && item.wearQuality ? (
          <span className={styles.wearCell}>{item.wearQuality}</span>
        ) : (
          <span className={styles.textMuted}>—</span>
        ),
    },
    {
      key: "currentPrice",
      header: "Current Price",
      align: "right",
      render: (_, item) =>
        item.currentPrice > 0 ? (
          <span className={styles.priceCell}>
            ${item.currentPrice.toFixed(2)}
          </span>
        ) : (
          <span className={styles.textMuted}>Price unavailable</span>
        ),
    },
    {
      key: "acquiredPrice",
      header: "Cost Basis",
      align: "right",
      render: (_, item) => (
        <div className={styles.editCell}>
          {editingId === item.id ? (
            <>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdatePrice(item.id);
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditPrice("");
                  }
                }}
                className={styles.editInput}
              />
              <button
                type="button"
                onClick={() => handleUpdatePrice(item.id)}
                className={styles.editButton}
              >
                ✓
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingId(item.id);
                setEditPrice(item.acquiredPrice?.toString() ?? "");
              }}
              title="Click to edit cost basis"
              className={styles.editLink}
            >
              {item.acquiredPrice != null ? (
                `$${item.acquiredPrice.toFixed(2)}`
              ) : (
                <span className={`${styles.textMuted} ${styles.textItalic}`}>Set price</span>
              )}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (_, item) =>
        item.pnl != null ? (
          <span className={item.pnl > 0 ? styles.pnlPositive : item.pnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
            {item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}
            <span className={styles.pnlPercent}>
              {item.pnlPercent != null && `(${item.pnlPercent >= 0 ? "+" : ""}${item.pnlPercent.toFixed(1)}%)`}
            </span>
          </span>
        ) : (
          <span className={styles.textMuted}>—</span>
        ),
    },
  ], [editingId, editPrice, handleUpdatePrice]);

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.loadingContent}>
          <div className={styles.loadingIcon}>[...]</div>
          <div>Loading portfolio...</div>
        </div>
      </div>
    );
  }

  const isEmpty = !portfolio || portfolio.itemCount === 0;
  const hasActiveFilters = Boolean(
    categoryFilter || rarityFilter || searchFilter || (priceFilter && priceFilter !== "all")
  );
  const totals = hasActiveFilters && portfolio?.filteredTotals
    ? portfolio.filteredTotals
    : portfolio;
  const itemCount = hasActiveFilters
    ? (portfolio?.filteredCount ?? portfolio?.itemCount ?? 0)
    : (portfolio?.itemCount ?? 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Your Portfolio</h3>
          <p className={styles.subtitle}>
            Track your CS2 inventory value and profit/loss
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => handleRefreshPrices()}
            disabled={refreshingPrices}
            className={styles.refreshButton}
          >
            {refreshingPrices ? "Refreshing..." : "Refresh Prices"}
          </button>
          <button
            type="button"
            onClick={() => handleSync()}
            disabled={syncing}
            className={styles.syncButton}
          >
            {syncing ? "Syncing..." : "Sync from Steam"}
          </button>
        </div>
      </div>

      <PortfolioFilters
        category={categoryFilter}
        rarity={rarityFilter}
        search={searchFilter}
        price={priceFilter}
        filterOptions={portfolio?.filterOptions}
        itemCount={itemCount}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {syncStatus && (
        <div className={`${styles.syncStatus} ${syncStatus.startsWith("[OK]") ? styles.syncStatusSuccess : syncStatus.startsWith("[ERR]") ? styles.syncStatusError : ""}`}>
          {syncStatus}
        </div>
      )}

      {isEmpty ? (
        <div className={`${styles.emptyState} card`}>
          <div className={styles.emptyIcon}>[empty]</div>
          <h3 className={styles.emptyTitle}>No inventory items yet</h3>
          <p className={styles.emptyDescription}>
            Sync your Steam CS2 inventory to start tracking your portfolio value and profit/loss.
          </p>
          <button
            type="button"
            onClick={() => handleSync()}
            disabled={syncing}
            className={styles.syncButton}
          >
            Sync from Steam
          </button>
        </div>
      ) : (
        <>
          <div className={styles.summaryRow}>
            <StatCard
              label="Total Value"
              value={`$${totals?.totalCurrentValue?.toFixed(2) ?? '0.00'}`}
              prefix=""
            />
            <StatCard
              label="Cost Basis"
              value={(totals?.totalAcquiredValue ?? 0) > 0 ? `$${totals?.totalAcquiredValue?.toFixed(2) ?? '0.00'}` : "—"}
            />
            <StatCard
              label="Unrealized P&L"
              value={(totals?.totalAcquiredValue ?? 0) > 0 ? `${(totals?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}$${totals?.unrealizedPnL?.toFixed(2) ?? '0.00'}` : "—"}
              change={totals?.unrealizedPnLPercent ?? 0}
              prefix=""
            />
            <StatCard
              label="Items"
              value={itemCount}
            />
          </div>

          <div className={styles.inventoryTable}>
            <DataTable
              columns={columns}
              data={portfolio?.items || []}
              isLoading={loading}
              emptyMessage="No items match your filters"
            />
          </div>
        </>
      )}

      {fallbackInfo && (
        <FallbackToast
          failureReason={fallbackInfo.failureReason}
          attemptedProvider={fallbackInfo.attemptedProvider}
          onApprove={() => {
            setFallbackInfo(null);
            if (fallbackInfo.source === "sync") {
              handleSync("steam");
            } else {
              handleRefreshPrices("steam");
            }
          }}
          onDismiss={() => setFallbackInfo(null)}
        />
      )}
    </div>
  );
}
