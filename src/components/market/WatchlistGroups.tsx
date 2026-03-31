"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { GroupManager } from "./GroupManager";
import styles from "./WatchlistGroups.module.css";

const PRESET_COLORS = [
  "#00C076",
  "#F6465D",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#607D8B",
];

const MAX_GROUPS = 20;

export interface Group {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  _count: { items: number };
}

interface WatchlistGroupsProps {
  groups: Group[];
  activeGroupId: string | null;
  onGroupSelect: (id: string | null) => void;
  onGroupsChange: () => void;
}

export function WatchlistGroups({
  groups,
  activeGroupId,
  onGroupSelect,
  onGroupsChange,
}: WatchlistGroupsProps) {
  const { addToast } = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [managerGroupId, setManagerGroupId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (groups.length >= MAX_GROUPS) {
      addToast(`Maximum ${MAX_GROUPS} groups allowed`, "warning");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: newColor }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json.error || "Failed to create group", "error");
        return;
      }

      addToast(`Group "${trimmed}" created`, "success");
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      setShowNewForm(false);
      onGroupsChange();
    } catch {
      addToast("Network error creating group", "error");
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, groups.length, addToast, onGroupsChange]);

  return (
    <div className={styles.tabBar}>
      <button
        type="button"
        className={`${styles.tab} ${activeGroupId === null ? styles.tabActive : ""}`}
        onClick={() => onGroupSelect(null)}
      >
        All Items
      </button>

      {groups.map((group) => (
        <div key={group.id} style={{ position: "relative" }}>
          <button
            type="button"
            className={`${styles.tab} ${activeGroupId === group.id ? styles.tabActive : ""}`}
            onClick={() => onGroupSelect(group.id)}
          >
            {group.color && (
              <span
                className={styles.tabDot}
                style={{ backgroundColor: group.color }}
              />
            )}
            {group.name}
            <span className={styles.tabCount}>{group._count.items}</span>
            <button
              type="button"
              className={styles.tabGear}
              onClick={(e) => {
                e.stopPropagation();
                setManagerGroupId(
                  managerGroupId === group.id ? null : group.id
                );
              }}
            >
              &#9881;
            </button>
          </button>

          {managerGroupId === group.id && (
            <GroupManager
              group={group}
              groups={groups}
              onClose={() => setManagerGroupId(null)}
              onGroupsChange={onGroupsChange}
            />
          )}
        </div>
      ))}

      {showNewForm ? (
        <div className={styles.inlineForm}>
          <input
            className={styles.inlineInput}
            placeholder="Group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowNewForm(false);
            }}
            maxLength={100}

          />
          <div className={styles.colorPicker}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.colorSwatch} ${newColor === color ? styles.colorSwatchSelected : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => setNewColor(color)}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.btnCreate}
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
          >
            {creating ? "..." : "Create"}
          </button>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={() => {
              setShowNewForm(false);
              setNewName("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.newGroupBtn}
          onClick={() => {
            if (groups.length >= MAX_GROUPS) {
              addToast(`Maximum ${MAX_GROUPS} groups allowed`, "warning");
              return;
            }
            setShowNewForm(true);
          }}
        >
          + New Group
        </button>
      )}
    </div>
  );
}
