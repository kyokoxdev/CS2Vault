/**
 * DataTable Component
 * Generic, typed data table with sticky headers, row hover, loading states,
 * and opt-in client-side column sorting.
 */

import { type KeyboardEvent, ReactNode, useMemo, useState } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  align?: "left" | "right";
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
  /** Enable client-side sorting for this column */
  sortable?: boolean;
}

type SortDirection = "asc" | "desc";

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  getRowKey?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  isLoading?: boolean;
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

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={styles.sortIndicator} aria-hidden="true">
      {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "⇅"}
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
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);

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

  return (
    <div className={styles.tableScroll}>
    <table className={styles.dataTable}>
      <thead>
        <tr>
          {columns.map((col) => {
            const colKey = String(col.key);
            const isActiveSort = sortKey === colKey && sortDirection !== null;
            return (
              <th
                key={colKey}
                className={[
                  col.align === "right" ? styles.alignRight : "",
                  col.sortable ? styles.sortableHeader : "",
                  isActiveSort ? styles.sortableHeaderActive : "",
                ].filter(Boolean).join(" ") || undefined}
                style={col.width ? { width: col.width } : undefined}
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
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={[
                    col.align === "right" ? styles.alignRight : "",
                    col.align === "right" ? styles.numericCell : "",
                  ].filter(Boolean).join(" ") || undefined}
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
}
