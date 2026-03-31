"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import SparklineChart from "@/components/charts/SparklineChart";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RARITY_VARIANTS } from "@/lib/market/rarity";
import { useToast } from "@/components/providers/ToastProvider";
import styles from "./WatchlistTable.module.css";

const NOTE_MAX_LENGTH = 500;

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
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

function NoteEditor({
  initialText,
  saving,
  onSave,
  onCancel,
}: {
  initialText: string;
  saving: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const charCount = text.length;
  const isNearLimit = charCount > NOTE_MAX_LENGTH * 0.9;

  return (
    <fieldset
      className={styles.noteEditor}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <textarea
        ref={textareaRef}
        className={styles.noteTextarea}
        value={text}
        onChange={(e) => {
          if (e.target.value.length <= NOTE_MAX_LENGTH) {
            setText(e.target.value);
          }
        }}
        placeholder="Add a note..."
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
      />
      <div className={styles.noteEditorFooter}>
        <span
          className={`${styles.noteCharCount}${isNearLimit ? ` ${styles.noteCharCountWarn}` : ""}`}
        >
          {charCount}/{NOTE_MAX_LENGTH}
        </span>
        <div className={styles.noteEditorActions}>
          <button
            type="button"
            className={styles.noteEditorBtn}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.noteEditorBtn} ${styles.noteEditorBtnSave}`}
            onClick={(e) => {
              e.stopPropagation();
              onSave(text);
            }}
            disabled={saving}
          >
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </fieldset>
  );
}

function ActionMenu({
  itemId,
  isWatched,
  hasNotes,
  onToggleWatch,
  onEditNote,
  onAssignGroup,
  onViewDetails,
}: {
  itemId: string;
  isWatched: boolean;
  hasNotes: boolean;
  onToggleWatch: (id: string, current: boolean) => void;
  onEditNote: (id: string) => void;
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
        &#x22EF;
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
            <span className={styles.actionMenuIcon}>{"\u2715"}</span>
            Unwatch
          </button>
          <button
            type="button"
            className={styles.actionMenuItem}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onEditNote(itemId);
              close();
            }}
          >
            <span className={styles.actionMenuIcon}>{"\u270E"}</span>
            {hasNotes ? "Edit Note" : "Add Note"}
          </button>
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
              <span className={styles.actionMenuIcon}>{"\u229E"}</span>
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
              <span className={styles.actionMenuIcon}>{"\u2197"}</span>
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
    return <span className={styles.mutedText}>&mdash;</span>;
  }
  const isPositive = value > 0;
  const isZero = value === 0;
  const arrow = isPositive ? "\u25B2" : "\u25BC";
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
  selectedIds,
  onSelectionChange,
}: WatchlistTableProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string | null>>({});

  const allSelected = items.length > 0 && selectedIds != null && items.every((item) => selectedIds.has(item.id));
  const someSelected = selectedIds != null && selectedIds.size > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map((item) => item.id)));
    }
  }, [items, allSelected, onSelectionChange]);

  const handleSelectRow = useCallback(
    (itemId: string) => {
      if (!onSelectionChange || !selectedIds) return;
      const next = new Set(selectedIds);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  const getItemNotes = useCallback(
    (item: Item): string | null => {
      if (item.id in noteOverrides) return noteOverrides[item.id];
      return item.notes;
    },
    [noteOverrides],
  );

  const handleOpenNoteEditor = useCallback(
    (itemId: string) => {
      setEditingNoteId(itemId);
      onAddNote?.(itemId);
    },
    [onAddNote],
  );

  const handleCancelNote = useCallback(() => {
    setEditingNoteId(null);
  }, []);

  const handleSaveNote = useCallback(
    async (text: string) => {
      if (!editingNoteId || savingNote) return;
      setSavingNote(true);
      try {
        const noteValue = text.trim() === "" ? null : text.trim();
        const res = await fetch(`/api/items/${editingNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: noteValue }),
        });
        if (!res.ok) throw new Error("Failed to save note");
        setNoteOverrides((prev) => ({ ...prev, [editingNoteId]: noteValue }));
        addToast("Note saved", "success");
        setEditingNoteId(null);
      } catch {
        addToast("Failed to save note", "error");
      } finally {
        setSavingNote(false);
      }
    },
    [editingNoteId, savingNote, addToast],
  );

  const columns: Column<Item>[] = [
    ...(onSelectionChange
      ? [
          {
            key: "select" as keyof Item,
            header: (
              <label
                className={styles.checkboxCell}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.stopPropagation();
                  }
                }}
              >
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={handleSelectAll}
                />
                <span className={styles.checkboxCustom} />
              </label>
            ),
            width: "40px",
            render: (_: unknown, item: Item) => (
              <label
                className={styles.checkboxCell}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.stopPropagation();
                  }
                }}
              >
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedIds?.has(item.id) ?? false}
                  onChange={() => handleSelectRow(item.id)}
                />
                <span className={styles.checkboxCustom} />
              </label>
            ),
          } satisfies Column<Item>,
        ]
      : []),
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
      render: (_, item) => {
        const itemNotes = getItemNotes(item);
        const isEditing = editingNoteId === item.id;

        return (
          <div className={styles.nameCell}>
            <div className={styles.nameRow}>
              <Link
                href={`/item/${item.id}`}
                className={styles.itemNameLink}
                onClick={(e) => e.stopPropagation()}
              >
                {item.name}
              </Link>
              {itemNotes && !isEditing && (
                <button
                  type="button"
                  className={styles.noteIndicator}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenNoteEditor(item.id);
                  }}
                  title={itemNotes}
                  aria-label="Edit note"
                >
                  {"\u270E"}
                </button>
              )}
            </div>
            <span className={styles.itemHashName}>{item.marketHashName}</span>
            {isEditing && (
              <NoteEditor
                initialText={itemNotes ?? ""}
                saving={savingNote}
                onSave={handleSaveNote}
                onCancel={handleCancelNote}
              />
            )}
          </div>
        );
      },
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
          <span className={styles.mutedText}>&mdash;</span>
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
          <span className={styles.mutedText}>&mdash;</span>
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
          {val ? `$${(val as number).toFixed(2)}` : "\u2014"}
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
          <span className={styles.mutedText}>&mdash;</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (_, item) => {
        const itemNotes = getItemNotes(item);
        return (
          <ActionMenu
            itemId={item.id}
            isWatched={item.isWatched}
            hasNotes={!!itemNotes}
            onToggleWatch={onToggleWatch}
            onEditNote={handleOpenNoteEditor}
            onAssignGroup={onAssignGroup}
            onViewDetails={onViewDetails}
          />
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      onRowClick={(item) => {
        if (editingNoteId) return;
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
