/**
 * DataTable Component
 * Generic, typed data table with sticky headers, row hover, and loading states
 */

import { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T extends Record<string, unknown>> {
  key: keyof T | string;
  header: string;
  align?: "left" | "right";
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T extends Record<string, unknown>> {
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

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  isLoading = false,
}: DataTableProps<T>) {
  return (
    <table className={styles.dataTable}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={String(col.key)}
              style={{
                textAlign: col.align || "left",
                width: col.width,
              }}
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
                  style={{
                    textAlign: col.align || "left",
                    width: col.width,
                    fontFamily: col.align === "right" ? "var(--font-numeric)" : undefined,
                  }}
                >
                  {col.render
                    ? col.render(row[col.key as keyof T], row)
                    : String(row[col.key as keyof T] ?? "—")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
