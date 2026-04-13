/**
 * DataTable Component
 * Generic, typed data table with sticky headers, row hover, loading states,
 * and opt-in client-side column sorting.
 */

import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: keyof T | string;
  header: ReactNode;
  align?: "left" | "right";
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
  /** Enable client-side sorting for this column */
  sortable?: boolean;
  /** Pin this column when table scrolls horizontally on mobile. Requires width to be set for correct offset calculation. Sticky columns must be contiguous from the left. */
  sticky?: boolean;
}

type SortDirection = "asc" | "desc";

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  getRowKey?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  isLoading?: boolean;
  mobileCardRenderer?: (row: T) => ReactNode;
}

function SkeletonRows({ columnCount }: { columnCount: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, idx) => (
        // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders, never reordered
        <tr key={`skeleton-${idx}`} className={styles.skeletonRow}>
          <td colSpan={columnCount} className={styles.skeletonCell}>
            <div className={styles.shimmer}></div>
          </td>
        </tr>
      ))}
    </>
  );
}

function SkeletonCards() {
  return (
    <div className={styles.cardList}>
      {Array.from({ length: 4 }).map((_, idx) => (
        // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
        <div key={`card-skeleton-${idx}`} className={styles.cardSkeleton}>
          <div className={styles.shimmer} style={{ height: 20, width: "60%" }} />
          <div className={styles.shimmer} style={{ height: 16, width: "40%", marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={styles.sortIndicator} aria-hidden="true">
      {direction === "asc" ? "\u25B2" : direction === "desc" ? "\u25BC" : "\u21C5"}
    </span>
  );
}

function stableSort<T>(arr: readonly T[], compareFn: (a: T, b: T) => number): T[] {
  const indexed = arr.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const order = compareFn(a.item, b.item);
    return order !== 0 ? order : a.index - b.index;
  });
  return indexed.map(({ item }) => item);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  getRowKey,
  emptyMessage = "No data available",
  isLoading = false,
  mobileCardRenderer,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const hasSetInitialView = useRef(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);
  const [forceTableView, setForceTableView] = useState(true);

  useEffect(() => {
    if (!hasSetInitialView.current && isMobile) {
      hasSetInitialView.current = true;
      setForceTableView(false);
    }
  }, [isMobile]);

  const handleSort = (columnKey: string) => {
    if (sortKey !== columnKey) {
      setSortKey(columnKey);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;
    return stableSort(data, (a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      const cmp = compareValues(aVal, bVal);
      return sortDirection === "desc" ? -cmp : cmp;
    });
  }, [data, sortKey, sortDirection]);

  const getAriaSortValue = (col: Column<T>): "ascending" | "descending" | "none" | undefined => {
    if (!col.sortable) return undefined;
    if (String(col.key) !== sortKey || !sortDirection) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  const hasCardView = !!mobileCardRenderer;

  const stickyOffsets = useMemo(() => {
    const offsets = new Map<number, number>();
    let leftOffset = 0;
    for (let i = 0; i < columns.length; i++) {
      if (!columns[i].sticky) break;
      offsets.set(i, leftOffset);
      const w = columns[i].width;
      if (w) {
        const px = parseInt(w, 10);
        if (!isNaN(px)) leftOffset += px;
      }
    }
    return offsets;
  }, [columns]);

  const buildCellStyle = (col: Column<T>, colIndex: number): CSSProperties | undefined => {
    const stickyLeft = stickyOffsets.get(colIndex);
    const hasWidth = !!col.width;
    const hasSticky = stickyLeft !== undefined;
    if (!hasWidth && !hasSticky) return undefined;
    return {
      ...(hasWidth ? { width: col.width } : {}),
      ...(hasSticky ? { left: stickyLeft } : {}),
    };
  };

  const buildCellClassName = (col: Column<T>, colIndex: number, extra?: string[]): string | undefined => {
    const classes = [
      col.align === "right" ? styles.alignRight : "",
      col.sticky && stickyOffsets.has(colIndex) ? styles.stickyColumn : "",
      ...(extra ?? []),
    ].filter(Boolean);
    return classes.length > 0 ? classes.join(" ") : undefined;
  };

  const tableView = (
    <div className={`${styles.tableScroll}${hasCardView && !forceTableView ? ` ${styles.viewHidden}` : ""}`}>
    <table className={styles.dataTable}>
      <thead>
        <tr>
          {columns.map((col, colIndex) => {
            const colKey = String(col.key);
            const isActiveSort = sortKey === colKey && sortDirection !== null;
            return (
              <th
                key={colKey}
                className={buildCellClassName(col, colIndex, [
                  col.sortable ? styles.sortableHeader : "",
                  isActiveSort ? styles.sortableHeaderActive : "",
                ])}
                style={buildCellStyle(col, colIndex)}
                aria-sort={getAriaSortValue(col)}
                {...(col.sortable
                  ? {
                      onClick: () => handleSort(colKey),
                      onKeyDown: (e: KeyboardEvent<HTMLTableCellElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(colKey);
                        }
                      },
                      tabIndex: 0,
                      role: "columnheader",
                    }
                  : {})}
              >
                <span className={col.sortable ? styles.sortableHeaderContent : undefined}>
                  {col.header}
                  {col.sortable && (
                    <SortIndicator
                      direction={sortKey === colKey ? sortDirection : null}
                    />
                  )}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <SkeletonRows columnCount={columns.length} />
        ) : data.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className={styles.emptyCell}
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          sortedData.map((row, idx) => (
            <tr
              key={getRowKey ? getRowKey(row, idx) : idx}
              className={onRowClick ? styles.clickable : ""}
              onClick={() => onRowClick?.(row)}
              aria-label={onRowClick ? "Click to view details" : undefined}
              {...(onRowClick
                ? {
                    tabIndex: 0,
                    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    },
                  }
                : {})}
            >
              {columns.map((col, colIndex) => (
                <td
                  key={String(col.key)}
                  className={buildCellClassName(col, colIndex, [
                    col.align === "right" ? styles.numericCell : "",
                  ])}
                  style={stickyOffsets.has(colIndex) ? { left: stickyOffsets.get(colIndex) } : undefined}
                >
                  {col.render
                    ? col.render(row[col.key as keyof T], row)
                    : String(row[col.key as keyof T] ?? "\u2014")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
    </div>
  );

  if (!hasCardView) return tableView;

  const cardView = (
    <div className={`${styles.cardList}${forceTableView ? ` ${styles.viewHidden}` : ""}`}>
      {isLoading ? (
        <SkeletonCards />
      ) : data.length === 0 ? (
        <div className={styles.emptyCell}>{emptyMessage}</div>
      ) : (
        sortedData.map((row, idx) => (
          <div
            key={getRowKey ? getRowKey(row, idx) : idx}
            className={`${styles.card}${onRowClick ? ` ${styles.clickable}` : ""}`}
            {...(onRowClick
              ? {
                  onClick: () => onRowClick(row),
                  tabIndex: 0,
                  role: "button",
                  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  },
                }
              : {})}
          >
            {mobileCardRenderer(row)}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className={styles.dataTableWrapper}>
      <div className={styles.viewToggle}>
        <button
          type="button"
          className={`${styles.viewToggleBtn}${!forceTableView ? ` ${styles.viewToggleBtnActive}` : ""}`}
          onClick={() => setForceTableView(false)}
          aria-label="Card view"
          aria-pressed={!forceTableView}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.viewToggleBtn}${forceTableView ? ` ${styles.viewToggleBtnActive}` : ""}`}
          onClick={() => setForceTableView(true)}
          aria-label="Table view"
          aria-pressed={forceTableView}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <line x1="1" y1="3" x2="15" y2="3" />
            <line x1="1" y1="8" x2="15" y2="8" />
            <line x1="1" y1="13" x2="15" y2="13" />
          </svg>
        </button>
      </div>
      {tableView}
      {cardView}
    </div>
  );
}
