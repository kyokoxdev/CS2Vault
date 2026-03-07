/**
 * DataTable Component
 * Generic, typed data table with sticky headers, row hover, and loading states
 */

import { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  align?: "left" | "right";
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

/**
 * Skeleton Row Component
 * Displays 5 animated rows while data loads
 */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, idx) => (
        <tr key={`skeleton-${idx}`} className={styles.skeletonRow}>
          <td colSpan={9} className={styles.skeletonCell}>
            <div className={styles.shimmer}></div>
          </td>
        </tr>
      ))}
    </>
  );
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  isLoading = false,
}: DataTableProps<T>) {
  return (
    <div className={styles.tableScroll}>
    <table className={styles.dataTable}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={String(col.key)}
              className={col.align === "right" ? styles.alignRight : undefined}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <SkeletonRows />
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
          data.map((row, idx) => (
            <tr
              key={idx}
              className={onRowClick ? styles.clickable : ""}
              onClick={() => onRowClick?.(row)}
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
