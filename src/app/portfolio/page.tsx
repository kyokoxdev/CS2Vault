"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { FaSpinner, FaBoxOpen, FaChartPie, FaChevronDown } from "react-icons/fa";
import { useRouter } from "next/navigation";
import styles from "./Portfolio.module.css";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FallbackToast } from "@/components/ui/FallbackToast";
import { useToast } from "@/components/providers/ToastProvider";
import { usePriceRefreshInterval } from "@/hooks/usePriceRefreshInterval";

interface PortfolioItem {
  id: string;
  itemId: string;
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
  isWatched: boolean;
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

interface RefreshPricesOptions {
  fallback?: string;
  silent?: boolean;
}

interface PriceRefreshResponse {
  success: boolean;
  data?: {
    pricedCount: number;
    priceSource: string | null;
    priceCoverage: { total: number; priced: number; candidates: number };
    priceSkippedRecent: number;
    priceLimitedTo: number | null;
    fallbackAvailable: boolean;
    failureReason: string | null;
    attemptedProvider: string | null;
  };
  error?: string;
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

function PortfolioActionMenu({
  item,
  onToggleWatchlist,
  onViewDetails,
}: {
  item: PortfolioItem;
  onToggleWatchlist: (item: PortfolioItem) => void;
  onViewDetails: (item: PortfolioItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => {
      if (!prev && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpward(spaceBelow < 160);
      }
      return !prev;
    });
  }, []);

  return (
    <div className={styles.actionMenuWrapper} ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.actionMenuTrigger}
        onClick={handleToggle}
        aria-label="Item actions"
        aria-expanded={open}
      >
        &#x22EF;
      </button>
      {open && (
        <div className={`${styles.actionMenuDropdown}${openUpward ? ` ${styles.actionMenuDropdownUp}` : ""}`} role="menu">
          <button
            type="button"
            className={styles.actionMenuItem}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(item);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>{item.isWatched ? "\u2715" : "\u2606"}</span>
            {item.isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
          </button>
          <button
            type="button"
            className={styles.actionMenuItem}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(item);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>{"\u2197"}</span>
            View Details
          </button>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { addToast, updateToast } = useToast();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [fallbackInfo, setFallbackInfo] = useState<{
    failureReason: string;
    attemptedProvider: string;
    source: "sync" | "prices";
  } | null>(null);
  const refreshRef = useRef<((options?: RefreshPricesOptions) => Promise<void>) | null>(null);
  const refreshInFlightRef = useRef(false);
  const priceRefreshIntervalMin = usePriceRefreshInterval();

  const fetchPortfolio = useCallback(async (options?: { bypassCache?: boolean }) => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (rarityFilter) params.set("rarity", rarityFilter);
      if (searchFilter) params.set("search", searchFilter);
      if (priceFilter && priceFilter !== "all") params.set("price", priceFilter);
      if (options?.bypassCache) {
        params.set("_ts", `${Date.now()}`);
      }
      const query = params.toString();
      const res = await fetch(`/api/portfolio${query ? `?${query}` : ""}`, options?.bypassCache ? { cache: "no-store" } : undefined);
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
        addToast(`Synced ${data.data.synced} items from Steam${coverageLabel}`, "success");
        await fetchPortfolio({ bypassCache: true });

        if (data.data?.fallbackAvailable && data.data?.failureReason) {
          setFallbackInfo({
            failureReason: data.data.failureReason,
            attemptedProvider: data.data.attemptedProvider ?? "unknown",
            source: "sync",
          });
        }
      } else {
        addToast(data.error, "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
    setSyncing(false);
  }, [fetchPortfolio, addToast]);

  const handleRefreshPrices = useCallback(async (options?: RefreshPricesOptions) => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    setRefreshingPrices(true);
    const fallback = options?.fallback;
    const silent = options?.silent ?? false;
    let progressToastId: string | null = null;

    try {
      if (!silent) {
        progressToastId = addToast("Refreshing portfolio prices\u2026", "info", 0);
      }

      const url = fallback
        ? `/api/portfolio/prices?fallback=${fallback}`
        : "/api/portfolio/prices";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skipCandleAggregation: true,
          bulkOnly: true,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const payload = (await response.json()) as PriceRefreshResponse;
      if (!payload.success || !payload.data) {
        throw new Error(payload.error ?? "Failed to refresh portfolio prices");
      }

      const { pricedCount, priceCoverage, priceSkippedRecent, fallbackAvailable, failureReason, attemptedProvider } = payload.data;
      const total = priceCoverage.total;

      await fetchPortfolio({ bypassCache: true });

      if (progressToastId) {
        if (priceSkippedRecent > 0 && pricedCount === 0) {
          updateToast(progressToastId, {
            message: "All prices are up to date",
            variant: "success",
            duration: 3000,
          });
        } else if (pricedCount > 0) {
          updateToast(progressToastId, {
            message: `Refreshed ${pricedCount}/${total} portfolio prices`,
            variant: "success",
            duration: 4000,
          });
        } else if (failureReason) {
          updateToast(progressToastId, {
            message: `Price refresh failed: ${failureReason}`,
            variant: "warning",
            duration: 5000,
          });
        } else {
          updateToast(progressToastId, {
            message: total === 0
              ? "No portfolio items to refresh"
              : `Refreshed 0/${total} portfolio prices`,
            variant: total === 0 ? "info" : "warning",
            duration: 4000,
          });
        }
      }

      if (!silent && failureReason && fallbackAvailable) {
        setFallbackInfo({
          failureReason,
          attemptedProvider: attemptedProvider ?? "unknown",
          source: "prices",
        });
      }
    } catch (err) {
      if (progressToastId) {
        updateToast(progressToastId, {
          message: "Price refresh failed \u2014 try again",
          variant: "error",
          duration: 5000,
        });
      }
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!progressToastId) {
          addToast(msg, "error");
        }
      }
    } finally {
      refreshInFlightRef.current = false;
      setRefreshingPrices(false);
    }
  }, [fetchPortfolio, addToast, updateToast]);

  refreshRef.current = handleRefreshPrices;

  const router = useRouter();

  const handleToggleWatchlist = useCallback(async (item: PortfolioItem) => {
    const newState = !item.isWatched;
    try {
      const res = await fetch(`/api/items/${item.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatched: newState }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(
          newState
            ? `Added "${item.name}" to watchlist`
            : `Removed "${item.name}" from watchlist`,
          "success",
        );
        setPortfolio((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.id === item.id ? { ...i, isWatched: newState } : i
            ),
          };
        });
      } else {
        addToast(data.error ?? "Failed to update watchlist", "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
  }, [addToast]);

  const handleViewDetails = useCallback((item: PortfolioItem) => {
    router.push(`/item/${item.itemId}?from=portfolio`);
  }, [router]);

  useEffect(() => {
    if (priceRefreshIntervalMin <= 0) return;

    const intervalMs = priceRefreshIntervalMin * 60 * 1000;
    const timer = setInterval(() => {
      refreshRef.current?.({ silent: true });
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
      sticky: true,
      render: (_, item) => (
        <div className={styles.itemCell}>
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className={styles.itemImage}
              loading="lazy"
              width={64}
              height={48}
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
                aria-label="Confirm price"
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
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (_, item) => (
        <PortfolioActionMenu
          item={item}
          onToggleWatchlist={handleToggleWatchlist}
          onViewDetails={handleViewDetails}
        />
      ),
    },
  ], [editingId, editPrice, handleUpdatePrice, handleToggleWatchlist, handleViewDetails]);

  const renderMobileCard = useCallback((item: PortfolioItem): ReactNode => {
    return (
      <div className={styles.mobileCard}>
        <div className={styles.mobileCardTop}>
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name} className={styles.itemImage} loading="lazy" width={48} height={36} />
          )}
          <div className={styles.mobileCardInfo}>
            <div className={styles.itemName}>{item.name}</div>
            {item.exterior && <div className={styles.itemExterior}>{item.exterior}</div>}
          </div>
          <PortfolioActionMenu
            item={item}
            onToggleWatchlist={handleToggleWatchlist}
            onViewDetails={handleViewDetails}
          />
        </div>
        <div className={styles.mobileCardMetrics}>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>Price</span>
            <span className={styles.priceCell}>
              {item.currentPrice > 0 ? `$${item.currentPrice.toFixed(2)}` : "\u2014"}
            </span>
          </div>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>Cost</span>
            {editingId === item.id ? (
              <div className={styles.editCell}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdatePrice(item.id);
                    if (e.key === "Escape") { setEditingId(null); setEditPrice(""); }
                  }}
                  className={styles.editInput}
                />
                <button type="button" onClick={() => handleUpdatePrice(item.id)} className={styles.editButton} aria-label="Confirm price">{"\u2713"}</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setEditPrice(item.acquiredPrice?.toString() ?? ""); }}
                className={styles.editLink}
              >
                {item.acquiredPrice != null ? `$${item.acquiredPrice.toFixed(2)}` : <span className={`${styles.textMuted} ${styles.textItalic}`}>Set</span>}
              </button>
            )}
          </div>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>P&L</span>
            {item.pnl != null ? (
              <span className={item.pnl > 0 ? styles.pnlPositive : item.pnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
                {item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}
                <span className={styles.pnlPercent}>
                  {item.pnlPercent != null && `(${item.pnlPercent >= 0 ? "+" : ""}${item.pnlPercent.toFixed(1)}%)`}
                </span>
              </span>
            ) : (
              <span className={styles.textMuted}>{"\u2014"}</span>
            )}
          </div>
        </div>
      </div>
    );
  }, [editingId, editPrice, handleUpdatePrice, handleToggleWatchlist, handleViewDetails]);

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.loadingContent}>
          <div className={styles.loadingIcon}><FaSpinner style={{ animation: "spin 1s linear infinite" }} /></div>
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

      {isEmpty ? (
        <div className={`${styles.emptyState} card`}>
          <div className={styles.emptyIcon}><FaBoxOpen /></div>
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
          <div className={`${styles.summarySection}${summaryExpanded ? ` ${styles.summarySectionExpanded}` : ""}`}>
            <button
              type="button"
              className={styles.summaryToggle}
              onClick={() => setSummaryExpanded((prev) => !prev)}
              aria-expanded={summaryExpanded}
            >
              <span className={styles.summaryToggleLeft}>
                <FaChartPie className={styles.summaryToggleIcon} />
                <span>Summary</span>
              </span>
              <span className={styles.summaryToggleRight}>
                <span className={styles.summaryToggleValue}>
                  ${totals?.totalCurrentValue?.toFixed(2) ?? '0.00'}
                </span>
                {(totals?.totalAcquiredValue ?? 0) > 0 && (
                  <span className={(totals?.unrealizedPnL ?? 0) >= 0 ? styles.pnlPositive : styles.pnlNegative}>
                    {(totals?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}{totals?.unrealizedPnLPercent?.toFixed(1) ?? '0.0'}%
                  </span>
                )}
                <FaChevronDown className={`${styles.summaryChevron}${summaryExpanded ? ` ${styles.summaryChevronOpen}` : ""}`} />
              </span>
            </button>
            <div className={styles.summaryRow}>
              <StatCard
                label="Total Value"
                value={`$${totals?.totalCurrentValue?.toFixed(2) ?? '0.00'}`}
                prefix=""
              />
              <StatCard
                label="Cost Basis"
                value={(totals?.totalAcquiredValue ?? 0) > 0 ? `$${totals?.totalAcquiredValue?.toFixed(2) ?? '0.00'}` : "\u2014"}
              />
              <StatCard
                label="Unrealized P&L"
                value={(totals?.totalAcquiredValue ?? 0) > 0 ? `${(totals?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}$${totals?.unrealizedPnL?.toFixed(2) ?? '0.00'}` : "\u2014"}
                change={totals?.unrealizedPnLPercent ?? 0}
                prefix=""
              />
              <StatCard
                label="Items"
                value={itemCount}
              />
            </div>
          </div>

          <div className={styles.inventoryTable}>
            <DataTable
              columns={columns}
              data={portfolio?.items || []}
              isLoading={loading}
              emptyMessage="No items match your filters"
              mobileCardRenderer={renderMobileCard}
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
              handleRefreshPrices({ fallback: "steam" });
            }
          }}
          onDismiss={() => setFallbackInfo(null)}
        />
      )}
    </div>
  );
}
