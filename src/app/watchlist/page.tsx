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
import { usePriceRefreshInterval } from "@/hooks/usePriceRefreshInterval";
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
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const priceRefreshIntervalMin = usePriceRefreshInterval();

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

    try {
      const url = fallback
        ? `/api/watchlist/prices?fallback=${fallback}`
        : "/api/watchlist/prices";
      const start = performance.now();
      const res = await fetch(url, { method: "POST" });
      const elapsed = Math.round(performance.now() - start);
      const data = await res.json();

      if (data.success) {
        addToast(`Refreshed ${data.data.itemCount} items in ${elapsed}ms`, "success");
        await fetchItems(false);

        if (data.data?.fallbackAvailable && data.data?.failureReason) {
          setFallbackInfo({
            failureReason: data.data.failureReason,
            attemptedProvider: data.data.attemptedProvider ?? "unknown",
          });
        }
      } else {
        addToast(`Failed: ${data.error}`, "error");
      }
    } catch {
      addToast(`Error refreshing prices`, "error");
    }

    setSyncing(false);
  }, [fetchItems, addToast]);

  useEffect(() => {
    void refreshWatchlistData(true);
  }, [refreshWatchlistData]);

  useEffect(() => {
    if (!Number.isFinite(priceRefreshIntervalMin) || priceRefreshIntervalMin <= 0) return;

    const intervalMs = priceRefreshIntervalMin * 60 * 1000;
    const timer = setInterval(() => {
      void handleRefreshPrices();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [handleRefreshPrices, priceRefreshIntervalMin]);

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

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, safePage]);

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
    setCurrentPage(1);
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
    setCurrentPage(1);
  }, []);

  const handleGroupSelect = useCallback((id: string | null) => {
    setGroupFilter(id ?? "");
    setCurrentPage(1);
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
    router.push(`/item/${id}?from=watchlist`);
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
            const affected = data.affected as number;
            setSelectedIds(new Set());
            await refreshWatchlistData(false);
            addToast(
              `Unwatched ${affected} item${affected !== 1 ? "s" : ""}`,
              "success",
              5000,
              {
                label: "Undo",
                onClick: () => {
                  void (async () => {
                    try {
                      const undoRes = await fetch("/api/items/bulk", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "rewatch", itemIds }),
                      });
                      const undoData = await undoRes.json();
                      if (undoData.success) {
                        addToast(`Re-watched ${undoData.affected} item${undoData.affected !== 1 ? "s" : ""}`, "success");
                        void refreshWatchlistData(false);
                      } else {
                        addToast("Failed to undo", "error");
                      }
                    } catch {
                      addToast("Failed to undo", "error");
                    }
                  })();
                },
              },
            );
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
    imageUrl: string | null;
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
          imageUrl: selected.imageUrl ?? undefined,
          category: selected.category,
          type: selected.type ?? undefined,
          rarity: selected.rarity ?? undefined,
          exterior: selected.exterior ?? undefined,
          isWatched: true,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const itemId = data.data.id as string;

        if (groupFilter) {
          try {
            const groupRes = await fetch(`/api/groups/${groupFilter}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemIds: [itemId] }),
            });
            if (groupRes.ok) {
              const groupName = groups.find((g) => g.id === groupFilter)?.name ?? "group";
              addToast(`Added \"${data.data.name}\" to watchlist and assigned to \"${groupName}\"`, "success");
            } else {
              addToast(`Added \"${data.data.name}\" to watchlist (failed to assign to group)`, "warning");
            }
          } catch {
            addToast(`Added \"${data.data.name}\" to watchlist (failed to assign to group)`, "warning");
          }
        } else {
          addToast(`Added \"${data.data.name}\" to watchlist`, "success");
        }

        setShowAddForm(false);
        await refreshWatchlistData(false);
      } else {
        addToast(data.error, "error");
      }
    } catch (err) {
      addToast(`${err}`, "error");
    }
  }, [addToast, refreshWatchlistData, groupFilter, groups]);

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

      if (current) {
        addToast("Item unwatched", "success", 5000, {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                const undoRes = await fetch(`/api/items/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isWatched: true }),
                });
                if (undoRes.ok) {
                  addToast("Item re-watched", "success");
                  void refreshWatchlistData(false);
                } else {
                  addToast("Failed to undo", "error");
                }
              } catch {
                addToast("Failed to undo", "error");
              }
            })();
          },
        });
      }
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
            items={paginatedItems}
            onToggleWatch={handleToggleWatch}
            onRowClick={handleViewDetails}
            onAssignGroup={handleOpenGroupAssignment}
            onViewDetails={handleViewDetails}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}

        {!itemsLoading && filteredItems.length > ITEMS_PER_PAGE && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
              aria-label="First page"
            >
              &#x21E4;
            </button>
            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              &#x2039;
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                return Math.abs(page - safePage) <= 1;
              })
              .reduce<(number | "ellipsis")[]>((acc, page, idx, arr) => {
                if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                  acc.push("ellipsis");
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${idx > 1 ? "end" : "start"}`} className={styles.paginationEllipsis}>
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.paginationBtn}${item === safePage ? ` ${styles.paginationBtnActive}` : ""}`}
                    onClick={() => setCurrentPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === safePage ? "page" : undefined}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              &#x203A;
            </button>
            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage >= totalPages}
              aria-label="Last page"
            >
              &#x21E5;
            </button>

            <span className={styles.paginationInfo}>
              {(safePage - 1) * ITEMS_PER_PAGE + 1}&ndash;{Math.min(safePage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
            </span>
          </div>
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
