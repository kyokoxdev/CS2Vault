"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FaTimes, FaPlus, FaSpinner, FaSyncAlt } from "react-icons/fa";
import { WatchlistTable, type Item } from "@/components/market/WatchlistTable";
import { WatchlistFilters } from "@/components/market/WatchlistFilters";
import { AddItemPanel } from "@/components/market/AddItemPanel";
import { FallbackToast } from "@/components/ui/FallbackToast";
import { useToast } from "@/components/providers/ToastProvider";
import styles from "./Watchlist.module.css";

interface ItemGroup {
  id: string;
  name: string;
  color: string | null;
}

type ItemWithGroups = Item & { groups?: ItemGroup[] };

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
}

export default function WatchlistPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<ItemWithGroups[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [fallbackInfo, setFallbackInfo] = useState<{
    failureReason: string;
    attemptedProvider: string;
  } | null>(null);
  const initialSyncRef = useRef(false);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    message: "",
    onConfirm: async () => {},
  });
  const [bulkLoading, setBulkLoading] = useState(false);

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

  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch("/api/groups");
        const data = await res.json();
        if (data.success) {
          setGroups(
            data.data.groups.map((g: { id: string; name: string }) => ({
              id: g.id,
              name: g.name,
            }))
          );
        }
      } catch {
      }
    }
    fetchGroups();
  }, []);

  const filterOptions = useMemo(() => {
    const categories = [...new Set(items.map((i) => i.category))].sort();
    const rarities = [
      ...new Set(items.map((i) => i.rarity).filter(Boolean) as string[]),
    ].sort();
    return { categories, rarities, groups };
  }, [items, groups]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (rarityFilter && item.rarity !== rarityFilter) return false;
      if (
        searchFilter &&
        !item.name.toLowerCase().includes(searchFilter.toLowerCase())
      )
        return false;
      if (
        groupFilter &&
        !item.groups?.some((g) => g.id === groupFilter)
      )
        return false;
      return true;
    });
  }, [items, categoryFilter, rarityFilter, searchFilter, groupFilter]);

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
      case "group":
        setGroupFilter(value);
        break;
    }
  };

  const handleClearFilters = () => {
    setCategoryFilter("");
    setRarityFilter("");
    setSearchFilter("");
    setGroupFilter("");
  };

  const handleBulkUnwatch = useCallback(() => {
    const count = selectedIds.size;
    setConfirmDialog({
      open: true,
      title: "Unwatch Items",
      message: `Are you sure? This will unwatch ${count} item${count !== 1 ? "s" : ""} from your watchlist.`,
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          const res = await fetch("/api/items/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unwatch", itemIds: [...selectedIds] }),
          });
          const data = await res.json();
          if (data.success) {
            addToast(`Unwatched ${data.affected} item${data.affected !== 1 ? "s" : ""}`, "success");
            setSelectedIds(new Set());
            fetchData();
          } else {
            addToast(data.error || "Failed to unwatch items", "error");
          }
        } catch {
          addToast("Network error unwatching items", "error");
        } finally {
          setBulkLoading(false);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  }, [selectedIds, addToast, fetchData]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    setConfirmDialog({
      open: true,
      title: "Delete Items",
      message: `Are you sure? This will permanently delete ${count} item${count !== 1 ? "s" : ""}.`,
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          const res = await fetch("/api/items/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", itemIds: [...selectedIds] }),
          });
          const data = await res.json();
          if (data.success) {
            addToast(`Deleted ${data.affected} item${data.affected !== 1 ? "s" : ""}`, "success");
            setSelectedIds(new Set());
            fetchData();
          } else {
            addToast(data.error || "Failed to delete items", "error");
          }
        } catch {
          addToast("Network error deleting items", "error");
        } finally {
          setBulkLoading(false);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
        }
      },
    });
  }, [selectedIds, addToast, fetchData]);

  const handleBulkAssignGroup = useCallback(
    async (groupId: string) => {
      if (!groupId) return;
      setBulkLoading(true);
      try {
        const res = await fetch(`/api/groups/${groupId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: [...selectedIds] }),
        });
        const data = await res.json();
        if (res.ok) {
          const groupName = groups.find((g) => g.id === groupId)?.name ?? "group";
          addToast(`Assigned ${data.data?.added ?? selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} to "${groupName}"`, "success");
          setSelectedIds(new Set());
          fetchData();
        } else {
          addToast(data.error || "Failed to assign to group", "error");
        }
      } catch {
        addToast("Network error assigning to group", "error");
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, groups, addToast, fetchData],
  );

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

      <WatchlistFilters
        category={categoryFilter}
        rarity={rarityFilter}
        search={searchFilter}
        group={groupFilter}
        filterOptions={filterOptions}
        itemCount={filteredItems.length}
        totalCount={items.length}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {selectedIds.size > 0 && (
        <div className={styles.bulkToolbar}>
          <span className={styles.bulkCount}>
            {selectedIds.size} selected
          </span>
          <span className={styles.bulkSeparator} />
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={handleBulkUnwatch}
            disabled={bulkLoading}
          >
            Unwatch ({selectedIds.size})
          </button>
          {groups.length > 0 && (
            <select
              className={styles.bulkGroupSelect}
              value=""
              onChange={(e) => handleBulkAssignGroup(e.target.value)}
              disabled={bulkLoading}
            >
              <option value="" disabled>
                Assign to Group...
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}
            onClick={handleBulkDelete}
            disabled={bulkLoading}
          >
            Delete ({selectedIds.size})
          </button>
          <button
            type="button"
            className={styles.bulkClearBtn}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className={styles.tableContainer}>
        {itemsLoading ? (
          <div className={styles.loadingState}>Loading watchlist...</div>
        ) : (
          <WatchlistTable
            items={filteredItems}
            onToggleWatch={handleToggleWatch}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}
      </div>

      {confirmDialog.open && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!bulkLoading) setConfirmDialog((prev) => ({ ...prev, open: false }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !bulkLoading) {
              setConfirmDialog((prev) => ({ ...prev, open: false }));
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={confirmDialog.title}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            <h4 className={styles.modalTitle}>{confirmDialog.title}</h4>
            <p className={styles.modalMessage}>{confirmDialog.message}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                disabled={bulkLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalConfirmBtn}
                onClick={confirmDialog.onConfirm}
                disabled={bulkLoading}
              >
                {bulkLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

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
