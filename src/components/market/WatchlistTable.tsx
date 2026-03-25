"use client";

import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./WatchlistTable.module.css";

export interface Item {
  id: string;
  marketHashName: string;
  name: string;
  category: string;
  type: string | null;
  rarity: string | null;
  exterior: string | null;
  isWatched: boolean;
  currentPrice: number | null;
  priceSource: string | null;
  lastUpdated: string | null;
}

interface WatchlistTableProps {
  items: Item[];
  onToggleWatch: (id: string, current: boolean) => void;
  onRowClick?: (id: string) => void;
}

export function WatchlistTable({
  items,
  onToggleWatch,
  onRowClick,
}: WatchlistTableProps) {
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    // router is undefined in tests without context
  }

  const columns: Column<Item>[] = [
    {
      key: "name",
      header: "Item",
      render: (_, item) => (
        <div>
          <Link
            href={`/item/${item.id}`}
            className={styles.itemNameLink}
            onClick={(e) => e.stopPropagation()}
          >
            {item.name}
          </Link>
          <span className={styles.itemHashName}>{item.marketHashName}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "120px",
      render: (val) => (
        <span className={styles.categoryCell}>{String(val)}</span>
      ),
    },
    {
      key: "type",
      header: "Weapon Type",
      width: "140px",
      render: (_, item) =>
        item.category === "weapon" && item.type ? (
          <Badge variant="neutral" size="sm">
            {item.type}
          </Badge>
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      key: "rarity",
      header: "Rarity",
      width: "140px",
      render: (val) =>
        val ? (
          <Badge variant="success" size="sm">
            {String(val)}
          </Badge>
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      key: "currentPrice",
      header: "Price",
      align: "right",
      width: "100px",
      render: (val) => (
        <span
          className={`${styles.priceCell} ${
            val ? styles.pricePositive : ""
          }`}
        >
          {val ? `$${(val as number).toFixed(2)}` : "—"}
        </span>
      ),
    },
    {
      key: "priceSource",
      header: "Source",
      width: "80px",
      render: (val) => (
        <span className={styles.sourceCell}>{String(val ?? "—")}</span>
      ),
    },
    {
      key: "lastUpdated",
      header: "Updated",
      width: "140px",
      render: (val) => (
        <span className={styles.dateCell}>
          {val ? new Date(String(val)).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "isWatched",
      header: "Status",
      width: "100px",
      render: (val) =>
        val ? (
          <Badge variant="success" size="sm">
            Watching
          </Badge>
        ) : (
          <Badge variant="danger" size="sm">
            Unwatched
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      render: (_, item) => (
        <div className={styles.actionsCell}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch(item.id, item.isWatched);
            }}
            title="Remove from watchlist"
          >
            Unwatch
          </button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      onRowClick={(item) => {
        if (onRowClick) {
          onRowClick(item.id);
        } else if (router) {
          router.push(`/item/${item.id}`);
        }
      }}
      emptyMessage="No items in watchlist. Add items above to start tracking."
    />
  );
}
