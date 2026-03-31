"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import SparklineChart from "@/components/charts/SparklineChart";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RARITY_VARIANTS } from "@/lib/market/rarity";
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
  imageUrl: string | null;
  priceChange24h: number | null;
  sparkline: { time: number; value: number }[];
  notes: string | null;
  groups: { id: string; name: string; color: string | null }[];
}

interface WatchlistTableProps {
  items: Item[];
  onToggleWatch: (id: string, current: boolean) => void;
  onRowClick?: (id: string) => void;
  onAddNote?: (id: string) => void;
  onAssignGroup?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

function ActionMenu({
  itemId,
  isWatched,
  onToggleWatch,
  onAddNote,
  onAssignGroup,
  onViewDetails,
}: {
  itemId: string;
  isWatched: boolean;
  onToggleWatch: (id: string, current: boolean) => void;
  onAddNote?: (id: string) => void;
  onAssignGroup?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className={styles.actionMenuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.actionMenuTrigger}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Item actions"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className={styles.actionMenuDropdown} role="menu">
          <button
            type="button"
            className={styles.actionMenuItem}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch(itemId, isWatched);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>✕</span>
            Unwatch
          </button>
          {onAddNote && (
            <button
              type="button"
              className={styles.actionMenuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onAddNote(itemId);
                close();
              }}
            >
              <span className={styles.actionMenuIcon}>✎</span>
              Add Note
            </button>
          )}
          {onAssignGroup && (
            <button
              type="button"
              className={styles.actionMenuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onAssignGroup(itemId);
                close();
              }}
            >
              <span className={styles.actionMenuIcon}>⊞</span>
              Assign to Group
            </button>
          )}
          {onViewDetails && (
            <button
              type="button"
              className={styles.actionMenuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(itemId);
                close();
              }}
            >
              <span className={styles.actionMenuIcon}>↗</span>
              View Details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PriceChangeCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className={styles.mutedText}>—</span>;
  }
  const isPositive = value > 0;
  const isZero = value === 0;
  const arrow = isPositive ? "▲" : "▼";
  const className = isZero
    ? styles.mutedText
    : isPositive
      ? styles.priceChangeBull
      : styles.priceChangeBear;

  return (
    <span className={className}>
      {!isZero && <span className={styles.priceChangeArrow}>{arrow}</span>}
      {isPositive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function WatchlistTable({
  items,
  onToggleWatch,
  onRowClick,
  onAddNote,
  onAssignGroup,
  onViewDetails,
}: WatchlistTableProps) {
  const router = useRouter();

  const columns: Column<Item>[] = [
    {
      key: "imageUrl",
      header: "",
      width: "72px",
      render: (_, item) => (
        <div className={styles.imageCell}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className={styles.itemImage}
              loading="lazy"
              width={64}
              height={48}
            />
          ) : (
            <div className={styles.itemImagePlaceholder} role="img" aria-label="No image">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "name",
      header: "Item",
      sortable: true,
      render: (_, item) => (
        <div className={styles.nameCell}>
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
      header: "Type",
      width: "120px",
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
      width: "120px",
      render: (val) =>
        val ? (
          <Badge variant={RARITY_VARIANTS[String(val)] ?? "neutral"} size="sm">
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
      sortable: true,
      render: (val) => (
        <span
          className={`${styles.priceCell} ${val ? styles.pricePositive : ""}`}
        >
          {val ? `$${(val as number).toFixed(2)}` : "—"}
        </span>
      ),
    },
    {
      key: "priceChange24h",
      header: "24h",
      align: "right",
      width: "100px",
      sortable: true,
      render: (val) => <PriceChangeCell value={val as number | null} />,
    },
    {
      key: "sparkline",
      header: "7d",
      width: "116px",
      render: (_, item) =>
        item.sparkline.length > 0 ? (
          <SparklineChart
            data={item.sparkline}
            width={100}
            height={28}
            color={
              item.priceChange24h != null
                ? item.priceChange24h >= 0
                  ? "#00C076"
                  : "#FF4D4F"
                : undefined
            }
          />
        ) : (
          <span className={styles.mutedText}>—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (_, item) => (
        <ActionMenu
          itemId={item.id}
          isWatched={item.isWatched}
          onToggleWatch={onToggleWatch}
          onAddNote={onAddNote}
          onAssignGroup={onAssignGroup}
          onViewDetails={onViewDetails}
        />
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
