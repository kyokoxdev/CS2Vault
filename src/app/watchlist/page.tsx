"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FaTimes, FaPlus, FaSpinner, FaSyncAlt, FaEye } from "react-icons/fa";
import { WatchlistTable, type Item } from "@/components/market/WatchlistTable";
import { WatchlistFilters } from "@/components/market/WatchlistFilters";
import { WatchlistGroups, type Group } from "@/components/market/WatchlistGroups";
import { AddItemPanel } from "@/components/market/AddItemPanel";
import { FallbackToast } from "@/components/ui/FallbackToast";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useToast } from "@/components/providers/ToastProvider";
import styles from "./Watchlist.module.css";

type ItemWithMaybeGroups = Item & { groups?: Item["groups"] };

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
}

function normalizeItem(item: ItemWithMaybeGroups): Item {
  return {
    ...item,
    groups: item.groups ?? [],
  };
}

export default function WatchlistPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [fallbackInfo, setFallbackInfo] = useState<{
    failureReason: string;
    attemptedProvider: string;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignmentItemId, setAssignmentItemId] = useState<string | null>(null);
  const [assigningGroupIds, setAssigningGroupIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    message: "",
    onConfirm: async () => {},
  });
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchItems = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setItemsLoading(true);
      const res = await fetch("/api/items?limit=100");
      const data = await res.json();

      if (data.success) {
        setItems((data.data.items as ItemWithMaybeGroups[]).map(normalizeItem));
      }
    } catch {
      addToast("Failed to load watchlist items", "error");
    } finally {
      setItemsLoading(false);
    }
  }, [addToast]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      const data = await res.json();

      if (data.success) {
        setGroups(data.data.groups as Group[]);
      }
    } catch {
      addToast("Failed to load groups", "error");
    }
  }, [addToast]);

  const refreshWatchlistData = useCallback(async (showLoading = false) => {
    await Promise.all([fetchItems(showLoading), fetchGroups()]);
  }, [fetchGroups, fetchItems]);

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
        setSyncStatus(`Refreshed ${data.data.itemCount} items in ${elapsed}ms`);
        setTimeout(() => setSyncStatus(""), 3000);
        await fetchItems(false);

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
  }, [fetchItems]);

  useEffect(() => {
    void refreshWatchlistData(true);
  }, [refreshWatchlistData]);

  useEffect(() => {
    const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
    const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
    if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

    const intervalMs = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      void handleRefreshPrices();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [handleRefreshPrices]);

  useEffect(() => {
    if (groupFilter && !groups.some((group) => group.id === groupFilter)) {
      setGroupFilter("");
    }
  }, [groupFilter, groups]);

  const watchlistItems = useMemo(
    () => items.filter((item) => item.isWatched),
    [items]
  );

  const filterOptions = useMemo(() => {
    const categories = [...new Set(watchlistItems.map((item) => item.category))].sort();
    const rarities = [
      ...new Set(watchlistItems.map((item) => item.rarity).filter(Boolean) as string[]),
    ].sort();

    return {
      categories,
      rarities,
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
    };
  }, [watchlistItems, groups]);

  const filteredItems = useMemo(() => {
    return watchlistItems.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (rarityFilter && item.rarity !== rarityFilter) return false;
      if (
        searchFilter &&
        !item.name.toLowerCase().includes(searchFilter.toLowerCase())
      ) {
        return false;
      }
      if (groupFilter && !item.groups.some((group) => group.id === groupFilter)) {
        return false;
      }

      return true;
    });
  }, [watchlistItems, categoryFilter, rarityFilter, searchFilter, groupFilter]);

  const filteredItemIds = useMemo(
    () => filteredItems.map((item) => item.id),
    [filteredItems]
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupFilter) ?? null,
    [groupFilter, groups]
  );

  const selectedGroupItemCount = useMemo(() => {
    if (!groupFilter) return watchlistItems.length;

    return watchlistItems.filter((item) =>
      item.groups.some((group) => group.id === groupFilter)
    ).length;
  }, [watchlistItems, groupFilter]);

  const assignmentItem = useMemo(
    () => items.find((item) => item.id === assignmentItemId) ?? null,
    [items, assignmentItemId]
  );

  const assignmentGroupIds = useMemo(
    () => new Set(assignmentItem?.groups.map((group) => group.id) ?? []),
    [assignmentItem]
  );

  const isWatchlistEmpty = !itemsLoading && watchlistItems.length === 0;
  const isGroupEmpty = !itemsLoading && Boolean(groupFilter) && selectedGroupItemCount === 0;
  const isFilterEmpty =
    !itemsLoading &&
    watchlistItems.length > 0 &&
    filteredItems.length === 0 &&
    !isGroupEmpty;

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;

      const visibleIds = new Set(filteredItemIds);
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));

      return next.size === prev.size ? prev : next;
    });
  }, [filteredItemIds]);

  const handleFilterChange = useCallback((field: string, value: string) => {
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
      default:
        break;
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setCategoryFilter("");
    setRarityFilter("");
    setSearchFilter("");
    setGroupFilter("");
  }, []);

  const handleGroupSelect = useCallback((id: string | null) => {
    setGroupFilter(id ?? "");
  }, []);

  const handleGroupsChange = useCallback(() => {
    void refreshWatchlistData(false);
  }, [refreshWatchlistData]);

  const handleOpenAddForm = useCallback(() => {
    setShowAddForm(true);
  }, []);

  const handleToggleAddForm = useCallback(() => {
    setShowAddForm((prev) => !prev);
  }, []);

  const handleViewDetails = useCallback((id: string) => {
    router.push(`/item/${id}`);
  }, [router]);

  const handleOpenGroupAssignment = useCallback((itemId: string) => {
    setAssignmentItemId(itemId);
  }, []);

  const handleCloseGroupAssignment = useCallback(() => {
    if (assigningGroupIds.size > 0) return;
    setAssignmentItemId(null);
  }, [assigningGroupIds]);

  const handleToggleItemGroup = useCallback(async (groupId: string) => {
    if (!assignmentItemId) return;

    const isAssigned = assignmentGroupIds.has(groupId);

    setAssigningGroupIds((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });

    try {
      const res = await fetch(`/api/groups/${groupId}/items`, {
        method: isAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [assignmentItemId] }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        addToast(data?.error || "Failed to update group assignment", "error");
        return;
      }

      const groupName = groups.find((group) => group.id === groupId)?.name ?? "group";
      addToast(
        `${isAssigned ? "Removed from" : "Assigned to"} \"${groupName}\"`,
        "success"
      );
      await refreshWatchlistData(false);
    } catch {
      addToast("Network error updating group assignment", "error");
    } finally {
      setAssigningGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }, [assignmentItemId, assignmentGroupIds, addToast, groups, refreshWatchlistData]);

  const handleBulkUnwatch = useCallback(() => {
    const itemIds = [...selectedIds];
    const count = itemIds.length;
    if (count === 0) return;

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
            body: JSON.stringify({ action: "unwatch", itemIds }),
          });
          const data = await res.json();

          if (data.success) {
            addToast(
              `Unwatched ${data.affected} item${data.affected !== 1 ? "s" : ""}`,
              "success"
            );
            setSelectedIds(new Set());
            await refreshWatchlistData(false);
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
  }, [selectedIds, addToast, refreshWatchlistData]);

  const handleBulkDelete = useCallback(() => {
    const itemIds = [...selectedIds];
    const count = itemIds.length;
    if (count === 0) return;

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
            body: JSON.stringify({ action: "delete", itemIds }),
          });
          const data = await res.json();

          if (data.success) {
            addToast(
              `Deleted ${data.affected} item${data.affected !== 1 ? "s" : ""}`,
              "success"
            );
            setSelectedIds(new Set());
            await refreshWatchlistData(false);
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
  }, [selectedIds, addToast, refreshWatchlistData]);

  const handleBulkAssignGroup = useCallback(async (groupId: string) => {
    const itemIds = [...selectedIds];
    if (!groupId || itemIds.length === 0) return;

    setBulkLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      const data = await res.json();

      if (res.ok) {
        const groupName = groups.find((group) => group.id === groupId)?.name ?? "group";
        addToast(
          `Assigned ${data.data?.added ?? itemIds.length} item${itemIds.length !== 1 ? "s" : ""} to \"${groupName}\"`,
          "success"
        );
        setSelectedIds(new Set());
        await refreshWatchlistData(false);
      } else {
        addToast(data.error || "Failed to assign to group", "error");
      }
    } catch {
      addToast("Network error assigning to group", "error");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, groups, addToast, refreshWatchlistData]);

  const handleAddItem = useCallback(async (selected: {
    hashName: string;
    name: string;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
  }) => {
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
        addToast(`Added \"${data.data.name}\" to watchlist`, "success");
        setShowAddForm(false);
        await refreshWatchlistData(false);
      } else {
        addToast(data.error, "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
  }, [addToast, refreshWatchlistData]);

  const handleToggleWatch = useCallback(async (id: string, current: boolean) => {
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatched: !current }),
      });

      if (!res.ok) {
        addToast("Failed to update watchlist item", "error");
        return;
      }

      await refreshWatchlistData(false);
    } catch {
      addToast("Failed to update watchlist item", "error");
    }
  }, [addToast, refreshWatchlistData]);

  const loadingColumns = useMemo<Column<Record<string, never>>[]>(() => (
    [
      { key: "select", header: "", width: "40px" },
      { key: "image", header: "", width: "72px" },
      { key: "name", header: "Item" },
      { key: "category", header: "Category", width: "120px" },
      { key: "type", header: "Type", width: "120px" },
      { key: "rarity", header: "Rarity", width: "120px" },
      { key: "price", header: "Price", width: "100px" },
      { key: "change", header: "24h", width: "100px" },
      { key: "sparkline", header: "7d", width: "116px" },
      { key: "actions", header: "", width: "48px" },
    ]
  ), []);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h3 className={styles.toolbarTitle}>Your Watchlist</h3>
        <div className={styles.toolbarActions}>
          {syncStatus && <span className={styles.statusMessage}>{syncStatus}</span>}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleToggleAddForm}
          >
            {showAddForm ? (
              <>
                <FaTimes style={{ fontSize: "0.875rem", marginRight: "4px" }} />
                Cancel
              </>
            ) : (
              <>
                <FaPlus style={{ fontSize: "0.875rem", marginRight: "4px" }} />
                Add Item
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleRefreshPrices()}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <FaSpinner style={{ fontSize: "0.875rem", marginRight: "4px", animation: "spin 1s linear infinite" }} />
                Refreshing...
              </>
            ) : (
              <>
                <FaSyncAlt style={{ fontSize: "0.875rem", marginRight: "4px" }} />
                Refresh Prices
              </>
            )}
          </button>
        </div>
      </div>

      {showAddForm && <AddItemPanel onAdd={handleAddItem} status="" />}

      <WatchlistGroups
        groups={groups}
        activeGroupId={groupFilter || null}
        onGroupSelect={handleGroupSelect}
        onGroupsChange={handleGroupsChange}
      />

      <WatchlistFilters
        category={categoryFilter}
        rarity={rarityFilter}
        search={searchFilter}
        group={groupFilter}
        filterOptions={filterOptions}
        itemCount={filteredItems.length}
        totalCount={watchlistItems.length}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {selectedIds.size > 0 && (
        <div className={styles.bulkToolbar}>
          <span className={styles.bulkCount}>{selectedIds.size} selected</span>
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
              onChange={(e) => void handleBulkAssignGroup(e.target.value)}
              disabled={bulkLoading}
            >
              <option value="" disabled>
                Assign to Group...
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
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
          <div className={styles.loadingTable}>
            <DataTable columns={loadingColumns} data={[]} isLoading={true} />
          </div>
        ) : isWatchlistEmpty ? (
          <div className={`${styles.emptyState} card`}>
            <div className={styles.emptyIcon}><FaEye /></div>
            <h3 className={styles.emptyTitle}>No items tracked yet</h3>
            <p className={styles.emptyDescription}>
              Add your first item to start tracking prices
            </p>
            <button
              type="button"
              onClick={handleOpenAddForm}
              className={styles.emptyAction}
            >
              Add Item
            </button>
          </div>
        ) : isGroupEmpty ? (
          <div className={`${styles.emptyState} card`}>
            <h3 className={styles.emptyTitle}>This group is empty</h3>
            <p className={styles.emptyDescription}>
              Assign items to {selectedGroup?.name ?? "this group"} from the table actions or bulk toolbar.
            </p>
            <div className={styles.emptyActions}>
              <button
                type="button"
                onClick={() => setGroupFilter("")}
                className={styles.emptySecondaryAction}
              >
                View All Items
              </button>
            </div>
          </div>
        ) : isFilterEmpty ? (
          <div className={`${styles.emptyState} card`}>
            <h3 className={styles.emptyTitle}>No items match your filters</h3>
            <p className={styles.emptyDescription}>
              Try adjusting your current filters or clear them to see all tracked items again.
            </p>
            <div className={styles.emptyActions}>
              <button
                type="button"
                onClick={handleClearFilters}
                className={styles.emptyAction}
              >
                Clear Filters
              </button>
            </div>
          </div>
        ) : (
          <WatchlistTable
            items={filteredItems}
            onToggleWatch={handleToggleWatch}
            onRowClick={handleViewDetails}
            onAssignGroup={handleOpenGroupAssignment}
            onViewDetails={handleViewDetails}
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
                onClick={() => void confirmDialog.onConfirm()}
                disabled={bulkLoading}
              >
                {bulkLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentItem && (
        <div
          className={styles.modalOverlay}
          onClick={handleCloseGroupAssignment}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleCloseGroupAssignment();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Assign item to groups"
        >
          <div
            className={`${styles.modalContent} ${styles.assignmentModal}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            <h4 className={styles.modalTitle}>Assign to groups</h4>
            <p className={styles.modalMessage}>{assignmentItem.name}</p>

            {groups.length === 0 ? (
              <div className={styles.assignmentEmpty}>
                Create a group from the tab bar to start organizing tracked items.
              </div>
            ) : (
              <div className={styles.assignmentList}>
                {groups.map((group) => {
                  const isAssigned = assignmentGroupIds.has(group.id);
                  const isSaving = assigningGroupIds.has(group.id);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={`${styles.assignmentItem}${isAssigned ? ` ${styles.assignmentItemActive}` : ""}`}
                      onClick={() => void handleToggleItemGroup(group.id)}
                      disabled={isSaving}
                    >
                      <span className={styles.assignmentItemMeta}>
                        {group.color && (
                          <span
                            className={styles.assignmentDot}
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        <span>{group.name}</span>
                      </span>
                      <span className={styles.assignmentState}>
                        {isSaving ? "Saving..." : isAssigned ? "Assigned" : "Assign"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={handleCloseGroupAssignment}
                disabled={assigningGroupIds.size > 0}
              >
                Done
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
            void handleRefreshPrices("steam");
          }}
          onDismiss={() => setFallbackInfo(null)}
        />
      )}
    </div>
  );
}
