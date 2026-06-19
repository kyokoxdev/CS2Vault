"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { FaBoxOpen, FaChartPie, FaChevronDown, FaTimes } from "react-icons/fa";
import { useRouter } from "next/navigation";
import styles from "./Portfolio.module.css";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FallbackToast } from "@/components/ui/FallbackToast";
import { useToast } from "@/components/providers/ToastProvider";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { usePriceRefreshInterval } from "@/hooks/usePriceRefreshInterval";
import { useSmartRefresh, markRefreshed } from "@/hooks/useSmartRefresh";
import { useStaleAwareRefresh } from "@/hooks/useStaleAwareRefresh";

type PortfolioTab = "active" | "sold";

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

interface SoldItem {
  id: string;
  itemId: string;
  assetId: string;
  name: string;
  marketHashName: string;
  category: string;
  rarity: string | null;
  exterior: string | null;
  imageUrl: string | null;
  acquiredPrice: number | null;
  soldPrice: number | null;
  realizedPnl: number;
  pnlPercent: number | null;
  acquiredAt: string;
  soldAt: string;
}

interface SoldData {
  totalSoldValue: number;
  totalAcquiredValue: number;
  hasAnyCostBasis: boolean;
  totalRealizedPnL: number;
  realizedPnLPercent: number | null;
  soldCount: number;
  items: SoldItem[];
}

interface PortfolioData {
  totalCurrentValue: number;
  totalAcquiredValue: number;
  hasAnyCostBasis: boolean;
  unrealizedPnL: number;
  unrealizedPnLPercent: number | null;
  itemCount: number;
  filteredCount?: number;
  items: PortfolioItem[];
  filteredTotals?: {
    totalCurrentValue: number;
    totalAcquiredValue: number;
    hasAnyCostBasis: boolean;
    unrealizedPnL: number;
    unrealizedPnLPercent: number | null;
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

interface ExposureBucket {
  key: string;
  label: string;
  categoryLabel: string;
  rarity: string | null;
  count: number;
  totalCurrentValue: number;
  totalAcquiredValue: number;
  hasAnyCostBasis: boolean;
  totalPnl: number;
  pnlPercent: number | null;
  pricedCount: number;
  share: number;
}

const MAX_EXPOSURE_NODES = 12;
const MOBILE_EXPOSURE_CARD_COUNT = 4;

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

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatCategoryLabel(category: string): string {
  return category
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildExposureBuckets(items: PortfolioItem[], totalPortfolioValue: number): ExposureBucket[] {
  const buckets = new Map<string, Omit<ExposureBucket, "share">>();

  for (const item of items) {
    const key = item.marketHashName || item.itemId || item.id;
    const currentValue = Math.max(item.currentPrice, 0);
    const acquiredValue = item.acquiredPrice ?? 0;
    const pnl = item.pnl ?? (item.acquiredPrice != null ? currentValue - item.acquiredPrice : 0);
    const current = buckets.get(key);

    if (current) {
      current.count += 1;
      current.totalCurrentValue += currentValue;
      current.totalAcquiredValue += acquiredValue;
      current.totalPnl += pnl;
      current.hasAnyCostBasis = current.hasAnyCostBasis || item.acquiredPrice != null;
      current.pricedCount += currentValue > 0 ? 1 : 0;
      continue;
    }

    buckets.set(key, {
      key,
      label: item.name,
      categoryLabel: formatCategoryLabel(item.category),
      rarity: item.rarity,
      count: 1,
      totalCurrentValue: currentValue,
      totalAcquiredValue: acquiredValue,
      hasAnyCostBasis: item.acquiredPrice != null,
      totalPnl: pnl,
      pnlPercent: null,
      pricedCount: currentValue > 0 ? 1 : 0,
    });
  }

  const sorted = Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      pnlPercent:
        bucket.hasAnyCostBasis && bucket.totalAcquiredValue > 0
          ? (bucket.totalPnl / bucket.totalAcquiredValue) * 100
          : null,
      share: totalPortfolioValue > 0 ? bucket.totalCurrentValue / totalPortfolioValue : 0,
    }))
    .sort((left, right) => {
      if (right.totalCurrentValue !== left.totalCurrentValue) {
        return right.totalCurrentValue - left.totalCurrentValue;
      }

      return right.count - left.count;
    });

  if (sorted.length <= MAX_EXPOSURE_NODES) {
    return sorted;
  }

  const visibleCount = Math.max(MAX_EXPOSURE_NODES - 1, 1);
  const visible = sorted.slice(0, visibleCount);
  const overflow = sorted.slice(visibleCount);
  const otherValue = overflow.reduce((sum, bucket) => sum + bucket.totalCurrentValue, 0);
  const otherAcquired = overflow.reduce((sum, bucket) => sum + bucket.totalAcquiredValue, 0);
  const otherPnl = overflow.reduce((sum, bucket) => sum + bucket.totalPnl, 0);
  const otherCount = overflow.reduce((sum, bucket) => sum + bucket.count, 0);
  const otherPricedCount = overflow.reduce((sum, bucket) => sum + bucket.pricedCount, 0);

  visible.push({
    key: "other-positions",
    label: "Other Positions",
    categoryLabel: `${overflow.length} smaller lines`,
    rarity: null,
    count: otherCount,
    totalCurrentValue: otherValue,
    totalAcquiredValue: otherAcquired,
    hasAnyCostBasis: overflow.some((bucket) => bucket.hasAnyCostBasis),
    totalPnl: otherPnl,
    pnlPercent: otherAcquired > 0 ? (otherPnl / otherAcquired) * 100 : null,
    pricedCount: otherPricedCount,
    share: totalPortfolioValue > 0 ? otherValue / totalPortfolioValue : 0,
  });

  return visible;
}

function useDropdownMenu() {
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

  return { open, openUpward, menuRef, triggerRef, close, handleToggle };
}

function MarkAsSoldModal({
  item,
  onClose,
  onConfirm,
}: {
  item: PortfolioItem;
  onClose: () => void;
  onConfirm: (id: string, soldPrice: number, soldAt: string) => void;
}) {
  const [soldPrice, setSoldPrice] = useState(
    item.currentPrice > 0 ? item.currentPrice.toFixed(2) : ""
  );
  const [soldDate, setSoldDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(soldPrice);
    if (isNaN(price) || price < 0 || !soldDate) return;
    setSubmitting(true);
    onConfirm(item.id, price, new Date(soldDate).toISOString());
  };

  const pnlPreview = (() => {
    const price = parseFloat(soldPrice);
    if (isNaN(price) || item.acquiredPrice === null || item.acquiredPrice === undefined) return null;
    return price - item.acquiredPrice;
  })();

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Mark as Sold"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <button type="button" className={styles.modalOverlayBackdrop} onClick={onClose} aria-label="Close dialog" />
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Mark as Sold</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className={styles.modalItemInfo}>
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name} className={styles.modalItemImage} />
          )}
          <div>
            <div className={styles.modalItemName}>{item.name}</div>
            {item.exterior && <div className={styles.modalItemSub}>{item.exterior}</div>}
            {item.acquiredPrice != null && (
              <div className={styles.modalItemSub}>Cost basis: ${item.acquiredPrice.toFixed(2)}{item.acquiredPrice === 0 ? " (free)" : ""}</div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <label className={styles.modalLabel}>
            Sold Price (USD)
            <input
              type="number"
              step="0.01"
              min="0"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              className={styles.modalInput}
              required
            />
          </label>
          <label className={styles.modalLabel}>
            Sold Date
            <input
              type="date"
              value={soldDate}
              onChange={(e) => setSoldDate(e.target.value)}
              className={styles.modalInput}
              required
            />
          </label>

          {pnlPreview !== null && (
            <div className={`${styles.modalPnlPreview} ${pnlPreview >= 0 ? styles.pnlPositive : styles.pnlNegative}`}>
              Realized P&L: {pnlPreview >= 0 ? "+" : ""}${pnlPreview.toFixed(2)}
              {item.acquiredPrice != null && item.acquiredPrice > 0 && (
                <span className={styles.pnlPercent}>
                  ({((pnlPreview / item.acquiredPrice) * 100) >= 0 ? "+" : ""}
                  {((pnlPreview / item.acquiredPrice) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.modalConfirmBtn}
              disabled={submitting || !soldPrice || !soldDate}
            >
              {submitting ? "Saving..." : "Confirm Sale"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PortfolioActionMenu({
  item,
  onToggleWatchlist,
  onViewDetails,
  onMarkAsSold,
}: {
  item: PortfolioItem;
  onToggleWatchlist: (item: PortfolioItem) => void;
  onViewDetails: (item: PortfolioItem) => void;
  onMarkAsSold: (item: PortfolioItem) => void;
}) {
  const { open, openUpward, menuRef, triggerRef, close, handleToggle } = useDropdownMenu();

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
              onMarkAsSold(item);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>{"\u{1F4B0}"}</span>
            Mark as Sold
          </button>
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

function SoldActionMenu({
  item,
  onUndoSold,
}: {
  item: SoldItem;
  onUndoSold: (item: SoldItem) => void;
}) {
  const { open, openUpward, menuRef, triggerRef, close, handleToggle } = useDropdownMenu();

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
              onUndoSold(item);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>{"\u21A9"}</span>
            Undo Sale
          </button>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { addToast, updateToast } = useToast();
  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<PortfolioTab>("active");
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [soldData, setSoldData] = useState<SoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [soldLoading, setSoldLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sellModalItem, setSellModalItem] = useState<PortfolioItem | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
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
        setLastPriceUpdate(data.data.lastPriceUpdate ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch portfolio:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, rarityFilter, searchFilter, priceFilter]);

  const fetchSoldItems = useCallback(async () => {
    setSoldLoading(true);
    try {
      const res = await fetch("/api/portfolio/sold");
      const data = await res.json();
      if (data.success) {
        setSoldData(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch sold items:", err);
    } finally {
      setSoldLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!soldData && !soldLoading) {
      fetchSoldItems();
    }
  }, [soldData, soldLoading, fetchSoldItems]);

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
        const updatedState = data.data?.isWatched ?? newState;
        addToast(
          updatedState
            ? `Added "${item.name}" to watchlist`
            : `Removed "${item.name}" from watchlist`,
          "success",
        );
        setPortfolio((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.itemId === item.itemId ? { ...i, isWatched: updatedState } : i
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

  const handleMarkAsSold = useCallback(async (id: string, soldPrice: number, soldAt: string) => {
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soldPrice, soldAt }),
      });
      const data = await res.json();
      if (data.success) {
        addToast("Item marked as sold", "success");
        setSellModalItem(null);
        await fetchPortfolio({ bypassCache: true });
        setSoldData(null);
      } else {
        addToast(data.error ?? "Failed to mark as sold", "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
  }, [fetchPortfolio, addToast]);

  const handleUndoSold = useCallback(async (item: SoldItem) => {
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soldPrice: null, soldAt: null }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`"${item.name}" moved back to active`, "success");
        await fetchSoldItems();
        await fetchPortfolio({ bypassCache: true });
      } else {
        addToast(data.error ?? "Failed to undo sale", "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
  }, [fetchSoldItems, fetchPortfolio, addToast]);

  useStaleAwareRefresh({
    key: "portfolio-prices",
    lastUpdated: lastPriceUpdate,
    intervalMin: priceRefreshIntervalMin,
    onStale: () => {
      refreshRef.current?.({ silent: true });
      markRefreshed();
    },
    enabled: !loading,
  });

  useSmartRefresh(
    [{ fn: () => refreshRef.current?.({ silent: true }), priority: 0 }],
    priceRefreshIntervalMin
  );

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
                `$${item.acquiredPrice.toFixed(2)}${item.acquiredPrice === 0 ? " (free)" : ""}`
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
          onMarkAsSold={setSellModalItem}
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
            onMarkAsSold={setSellModalItem}
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
                {item.acquiredPrice != null ? `$${item.acquiredPrice.toFixed(2)}${item.acquiredPrice === 0 ? " (free)" : ""}` : <span className={`${styles.textMuted} ${styles.textItalic}`}>Set</span>}
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

  const soldColumns = useMemo<Column<SoldItem>[]>(() => [
    {
      key: "name",
      header: "Item",
      sticky: true,
      render: (_, item) => (
        <div className={styles.itemCell}>
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name} className={styles.itemImage} loading="lazy" width={64} height={48} />
          )}
          <div>
            <div className={styles.itemName}>{item.name}</div>
            {item.exterior && <div className={styles.itemExterior}>{item.exterior}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "acquiredPrice",
      header: "Cost Basis",
      align: "right",
      render: (_, item) =>
        item.acquiredPrice != null ? (
          <span className={styles.priceCell}>${item.acquiredPrice.toFixed(2)}{item.acquiredPrice === 0 ? " (free)" : ""}</span>
        ) : (
          <span className={styles.textMuted}>{"\u2014"}</span>
        ),
    },
    {
      key: "soldPrice",
      header: "Sold Price",
      align: "right",
      render: (_, item) =>
        item.soldPrice != null ? (
          <span className={styles.priceCell}>${item.soldPrice.toFixed(2)}</span>
        ) : (
          <span className={styles.textMuted}>{"\u2014"}</span>
        ),
    },
    {
      key: "realizedPnl",
      header: "Realized P&L",
      align: "right",
      render: (_, item) => (
        <span className={item.realizedPnl > 0 ? styles.pnlPositive : item.realizedPnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
          {item.realizedPnl >= 0 ? "+" : ""}${item.realizedPnl.toFixed(2)}
          {item.pnlPercent != null && item.pnlPercent !== 0 && (
            <span className={styles.pnlPercent}>
              ({item.pnlPercent >= 0 ? "+" : ""}{item.pnlPercent.toFixed(1)}%)
            </span>
          )}
        </span>
      ),
    },
    {
      key: "soldAt",
      header: "Sold Date",
      render: (_, item) => (
        <span className={styles.dateCell}>
          {item.soldAt ? new Date(item.soldAt).toLocaleDateString() : "\u2014"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (_, item) => (
        <SoldActionMenu item={item} onUndoSold={handleUndoSold} />
      ),
    },
  ], [handleUndoSold]);

  const renderSoldMobileCard = useCallback((item: SoldItem): ReactNode => {
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
          <SoldActionMenu item={item} onUndoSold={handleUndoSold} />
        </div>
        <div className={styles.mobileCardMetrics}>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>Cost</span>
            <span className={styles.priceCell}>
              {item.acquiredPrice != null ? `$${item.acquiredPrice.toFixed(2)}${item.acquiredPrice === 0 ? " (free)" : ""}` : "\u2014"}
            </span>
          </div>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>Sold</span>
            <span className={styles.priceCell}>
              {item.soldPrice != null ? `$${item.soldPrice.toFixed(2)}` : "\u2014"}
            </span>
          </div>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>P&L</span>
            <span className={item.realizedPnl > 0 ? styles.pnlPositive : item.realizedPnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
              {item.realizedPnl >= 0 ? "+" : ""}${item.realizedPnl.toFixed(2)}
            </span>
          </div>
          <div className={styles.mobileCardMetric}>
            <span className={styles.mobileCardLabel}>Date</span>
            <span>{item.soldAt ? new Date(item.soldAt).toLocaleDateString() : "\u2014"}</span>
          </div>
        </div>
      </div>
    );
  }, [handleUndoSold]);

  const isEmpty = !loading && (!portfolio || portfolio.itemCount === 0);
  const hasActiveFilters = Boolean(
    categoryFilter || rarityFilter || searchFilter || (priceFilter && priceFilter !== "all")
  );
  const totals = hasActiveFilters && portfolio?.filteredTotals
    ? portfolio.filteredTotals
    : portfolio;
  const itemCount = hasActiveFilters
    ? (portfolio?.filteredCount ?? portfolio?.itemCount ?? 0)
    : (portfolio?.itemCount ?? 0);

  const realizedPnL = soldData?.totalRealizedPnL ?? 0;
  const unrealizedPnL = totals?.unrealizedPnL ?? 0;
  const totalPnL = unrealizedPnL + realizedPnL;
  const totalCurrentValue = totals?.totalCurrentValue ?? 0;

  const exposureBuckets = buildExposureBuckets(portfolio?.items ?? [], totalCurrentValue);

  const topHolding = exposureBuckets[0] ?? null;
  const topThreeShare = exposureBuckets
    .slice(0, Math.min(3, exposureBuckets.length))
    .reduce((sum, bucket) => sum + bucket.share, 0);
  const pricedHoldingsCount = (portfolio?.items ?? []).filter((item) => item.currentPrice > 0).length;
  const pricedCoverage = itemCount > 0 ? (pricedHoldingsCount / itemCount) * 100 : 0;
  const totalsByCategory = new Map<string, number>();

  for (const item of portfolio?.items ?? []) {
    totalsByCategory.set(
      item.category,
      (totalsByCategory.get(item.category) ?? 0) + Math.max(item.currentPrice, 0)
    );
  }

  const categoryExposure = Array.from(totalsByCategory.entries())
    .map(([category, value]) => ({
      label: formatCategoryLabel(category),
      value,
      share: totalCurrentValue > 0 ? value / totalCurrentValue : 0,
    }))
    .sort((left, right) => right.value - left.value);
  const topCategory = categoryExposure[0] ?? null;
  const hasExposureData = exposureBuckets.some((bucket) => bucket.totalCurrentValue > 0);
  const mobileExposureBuckets = exposureBuckets.slice(0, MOBILE_EXPOSURE_CARD_COUNT);

  return (
    <div
      className={styles.page}
      data-testid="route-portfolio"
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <div className={styles.tabBar} role="tablist">
        <div className={styles.tabGroup}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "active"}
            className={`${styles.tabButton} ${activeTab === "active" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("active")}
          >
            Active
            {portfolio && portfolio.itemCount > 0 && (
              <span className={styles.tabBadge}>{portfolio.itemCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "sold"}
            className={`${styles.tabButton} ${activeTab === "sold" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("sold")}
          >
            Sold
            {soldData && soldData.soldCount > 0 && (
              <span className={styles.tabBadge}>{soldData.soldCount}</span>
            )}
          </button>
        </div>

        {activeTab === "active" && (
          <div className={styles.headerActions} style={{ marginBottom: "8px" }}>
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
        )}
      </div>

      {activeTab === "active" && (
        <>
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
                    {totals?.hasAnyCostBasis && (totals?.unrealizedPnLPercent ?? 0) !== 0 && (
                      <span className={(totals?.unrealizedPnL ?? 0) >= 0 ? styles.pnlPositive : styles.pnlNegative}>
                        {(totals?.unrealizedPnL ?? 0) >= 0 ? "+" : ""}{totals?.unrealizedPnLPercent?.toFixed(1) ?? '0.0'}%
                      </span>
                    )}
                    <FaChevronDown className={`${styles.summaryChevron}${summaryExpanded ? ` ${styles.summaryChevronOpen}` : ""}`} />
                  </span>
                </button>
                <div className={styles.summaryContent} data-testid="portfolio-exposure-summary">
                  <div className={styles.exposureSignals}>
                    <div className={styles.exposureSignalCard}>
                      <span className={styles.exposureSignalLabel}>Largest holding</span>
                      <strong className={styles.exposureSignalValue}>
                        {topHolding ? `${(topHolding.share * 100).toFixed(1)}%` : "--"}
                      </strong>
                      <span className={styles.exposureSignalMeta}>
                        {topHolding ? topHolding.label : "No priced positions yet"}
                      </span>
                    </div>
                    <div className={styles.exposureSignalCard}>
                      <span className={styles.exposureSignalLabel}>Top 3 concentration</span>
                      <strong className={styles.exposureSignalValue}>{(topThreeShare * 100).toFixed(1)}%</strong>
                      <span className={styles.exposureSignalMeta}>
                        {topThreeShare >= 0.65 ? "High concentration" : topThreeShare >= 0.4 ? "Balanced book" : "Distributed book"}
                      </span>
                    </div>
                    <div className={styles.exposureSignalCard}>
                      <span className={styles.exposureSignalLabel}>Priced coverage</span>
                      <strong className={styles.exposureSignalValue}>{pricedCoverage.toFixed(0)}%</strong>
                      <span className={styles.exposureSignalMeta}>{pricedHoldingsCount}/{itemCount} priced holdings</span>
                    </div>
                  </div>

                  <div className={styles.summaryRow}>
                    <StatCard
                      label="Total Value"
                      value={totals?.totalCurrentValue ?? 0}
                      prefix="$"
                      fractionDigits={2}
                    />
                    <StatCard
                      label="Cost Basis"
                      value={totals?.hasAnyCostBasis ? (totals?.totalAcquiredValue ?? 0) : "\u2014"}
                      prefix={totals?.hasAnyCostBasis ? "$" : undefined}
                      fractionDigits={2}
                    />
                    <StatCard
                      label="Unrealized P&L"
                      value={totals?.hasAnyCostBasis ? unrealizedPnL : "\u2014"}
                      change={totals?.unrealizedPnLPercent ?? 0}
                      prefix={totals?.hasAnyCostBasis ? (unrealizedPnL >= 0 ? "+$" : "$") : undefined}
                      fractionDigits={2}
                    />
                    <StatCard
                      label="Realized P&L"
                      value={realizedPnL !== 0 ? realizedPnL : "\u2014"}
                      change={soldData?.realizedPnLPercent ?? 0}
                      prefix={realizedPnL !== 0 ? (realizedPnL >= 0 ? "+$" : "$") : undefined}
                      fractionDigits={2}
                    />
                    <StatCard
                      label="Total P&L"
                      value={totals?.hasAnyCostBasis || realizedPnL !== 0 ? totalPnL : "\u2014"}
                      prefix={totals?.hasAnyCostBasis || realizedPnL !== 0 ? (totalPnL >= 0 ? "+$" : "$") : undefined}
                      fractionDigits={2}
                    />
                  </div>

                  <div className={styles.exposureLayout}>
                    <section className={styles.exposureTreemapPanel} data-testid="portfolio-treemap">
                      <div className={styles.sectionHeader}>
                        <div>
                          <h3 className={styles.sectionTitle}>Allocation Map</h3>
                          <p className={styles.sectionSubtle}>Block size tracks value. Color tracks performance.</p>
                        </div>
                      </div>

                      {hasExposureData ? (
                        <div className={styles.treemap} data-testid="portfolio-exposure-treemap">
                          {exposureBuckets.map((bucket) => {
                            const toneClass = bucket.key === "other-positions"
                              ? styles.treemapNodeOther
                              : bucket.totalPnl > 0
                                ? styles.treemapNodePositive
                                : bucket.totalPnl < 0
                                  ? styles.treemapNodeNegative
                                  : styles.treemapNodeNeutral;
                            const flexGrow = Math.max(Math.round(bucket.share * 100), 10);
                            const flexBasis = bucket.share >= 0.3
                              ? "38%"
                              : bucket.share >= 0.18
                                ? "30%"
                                : bucket.share >= 0.1
                                  ? "22%"
                                  : "16%";

                            return (
                              <article
                                key={bucket.key}
                                className={`${styles.treemapNode} ${toneClass}`}
                                style={{ flexGrow, flexBasis }}
                                data-testid="portfolio-exposure-node"
                                aria-label={`${bucket.label}, ${formatCurrency(bucket.totalCurrentValue)}, ${(bucket.share * 100).toFixed(1)} percent of portfolio, ${formatSignedPercent(bucket.pnlPercent)}`}
                                title={`${bucket.label} • ${formatCurrency(bucket.totalCurrentValue)} • ${(bucket.share * 100).toFixed(1)}% of portfolio`}
                              >
                                <div className={styles.treemapNodeHeader}>
                                  <span className={styles.treemapNodeLabel}>{bucket.label}</span>
                                  <span className={styles.treemapNodeShare}>{(bucket.share * 100).toFixed(1)}%</span>
                                </div>
                                <strong className={styles.treemapNodeValue}>{formatCurrency(bucket.totalCurrentValue)}</strong>
                                <div className={styles.treemapNodeMeta}>
                                  <span>{bucket.count} {bucket.count === 1 ? "item" : "items"}</span>
                                  <span>{bucket.hasAnyCostBasis ? formatSignedPercent(bucket.pnlPercent) : "No basis"}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.treemapEmpty} data-testid="portfolio-exposure-treemap">
                          Waiting for priced positions before the allocation map can size exposure blocks.
                        </div>
                      )}

                      <div className={styles.mobileExposureList} data-testid="portfolio-exposure-mobile">
                        {mobileExposureBuckets.map((bucket) => (
                          <article key={`mobile-${bucket.key}`} className={styles.mobileExposureCard}>
                            <div className={styles.mobileExposureTop}>
                              <div>
                                <div className={styles.mobileExposureLabel}>{bucket.label}</div>
                                <div className={styles.mobileExposureMeta}>{bucket.categoryLabel}</div>
                              </div>
                              <div className={styles.mobileExposureShare}>{(bucket.share * 100).toFixed(1)}%</div>
                            </div>
                            <div className={styles.mobileExposureBottom}>
                              <strong className={styles.mobileExposureValue}>{formatCurrency(bucket.totalCurrentValue)}</strong>
                              <span className={bucket.totalPnl > 0 ? styles.pnlPositive : bucket.totalPnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
                                {bucket.hasAnyCostBasis ? formatSignedPercent(bucket.pnlPercent) : "No basis"}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <aside className={styles.exposureSidebar}>
                      <div className={styles.insightCard}>
                        <span className={styles.insightLabel}>Largest category</span>
                        <strong className={styles.insightValue}>{topCategory ? topCategory.label : "--"}</strong>
                        <span className={styles.insightMeta}>
                          {topCategory ? `${(topCategory.share * 100).toFixed(1)}% of portfolio value` : "Waiting for priced items"}
                        </span>
                      </div>
                      <div className={styles.insightCard}>
                        <span className={styles.insightLabel}>Risk posture</span>
                        <strong className={styles.insightValue}>
                          {topThreeShare >= 0.65 ? "Concentrated" : topThreeShare >= 0.4 ? "Balanced" : "Broad"}
                        </strong>
                        <span className={styles.insightMeta}>
                          {topThreeShare >= 0.65
                            ? "Top positions dominate current mark-to-market exposure."
                            : topThreeShare >= 0.4
                              ? "Core lines matter, but smaller positions still move the book."
                              : "Exposure is spread across many smaller positions."}
                        </span>
                      </div>
                      <div className={styles.holdingsCard}>
                        <div className={styles.sectionHeader}>
                          <div>
                            <h3 className={styles.sectionTitle}>Top holdings</h3>
                            <p className={styles.sectionSubtle}>Current value and delta for the heaviest lines.</p>
                          </div>
                        </div>
                        <ol className={styles.holdingsList}>
                          {exposureBuckets.slice(0, 4).map((bucket, index) => (
                            <li key={`top-${bucket.key}`} className={styles.holdingRow}>
                              <span className={styles.holdingRank}>{index + 1}</span>
                              <div className={styles.holdingInfo}>
                                <span className={styles.holdingLabel}>{bucket.label}</span>
                                <span className={styles.holdingMeta}>{bucket.categoryLabel} • {bucket.count} {bucket.count === 1 ? "item" : "items"}</span>
                              </div>
                              <div className={styles.holdingValueBlock}>
                                <strong className={styles.holdingValue}>{formatCurrency(bucket.totalCurrentValue)}</strong>
                                <span className={bucket.totalPnl > 0 ? styles.pnlPositive : bucket.totalPnl < 0 ? styles.pnlNegative : styles.pnlNeutral}>
                                  {bucket.hasAnyCostBasis ? formatSignedPercent(bucket.pnlPercent) : "No basis"}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </aside>
                  </div>
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
        </>
      )}

      {activeTab === "sold" && (
        <>
          {soldData && soldData.soldCount > 0 && (
            <div className={styles.summaryRow}>
              <StatCard
                label="Total Sold Value"
                value={soldData.totalSoldValue}
                prefix="$"
                fractionDigits={2}
              />
              <StatCard
                label="Cost Basis"
                value={soldData.hasAnyCostBasis ? soldData.totalAcquiredValue : "\u2014"}
                prefix={soldData.hasAnyCostBasis ? "$" : undefined}
                fractionDigits={2}
              />
              <StatCard
                label="Realized P&L"
                value={soldData.totalRealizedPnL}
                change={soldData.realizedPnLPercent}
                prefix={soldData.totalRealizedPnL >= 0 ? "+$" : "$"}
                fractionDigits={2}
              />
              <StatCard
                label="Items Sold"
                value={soldData.soldCount}
              />
            </div>
          )}

          <div className={styles.inventoryTable}>
            <DataTable
              columns={soldColumns}
              data={soldData?.items || []}
              isLoading={soldLoading}
              emptyMessage="No sold items yet. Mark items as sold from the Active tab."
              mobileCardRenderer={renderSoldMobileCard}
            />
          </div>
        </>
      )}

      {sellModalItem && (
        <MarkAsSoldModal
          item={sellModalItem}
          onClose={() => setSellModalItem(null)}
          onConfirm={handleMarkAsSold}
        />
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
