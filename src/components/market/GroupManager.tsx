"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import type { Group } from "./WatchlistGroups";
import styles from "./WatchlistGroups.module.css";

const PRESET_COLORS = [
  "#00C076",
  "#F6465D",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#607D8B",
];

interface GroupManagerProps {
  group: Group;
  groups: Group[];
  onClose: () => void;
  onGroupsChange: () => void;
}

export function GroupManager({
  group,
  groups,
  onClose,
  onGroupsChange,
}: GroupManagerProps) {
  const { addToast } = useToast();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color || PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const json = await res.json();

      if (!res.ok) {
        addToast(json.error || "Failed to update group", "error");
        return;
      }

      addToast("Group updated", "success");
      onGroupsChange();
      onClose();
    } catch {
      addToast("Network error updating group", "error");
    } finally {
      setSaving(false);
    }
  }, [name, color, group.id, addToast, onGroupsChange, onClose]);

  const handleDelete = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        addToast(json.error || "Failed to delete group", "error");
        return;
      }

      addToast(`Group "${group.name}" deleted`, "success");
      onGroupsChange();
      onClose();
    } catch {
      addToast("Network error deleting group", "error");
    }
  }, [group.id, group.name, addToast, onGroupsChange, onClose]);

  const handleReorder = useCallback(
    async (direction: "up" | "down") => {
      const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((g) => g.id === group.id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;

      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      const targetGroup = sorted[targetIdx];

      try {
        const [res1, res2] = await Promise.all([
          fetch(`/api/groups/${group.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: targetGroup.sortOrder }),
          }),
          fetch(`/api/groups/${targetGroup.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: group.sortOrder }),
          }),
        ]);

        if (!res1.ok || !res2.ok) {
          addToast("Failed to reorder", "error");
          return;
        }

        onGroupsChange();
      } catch {
        addToast("Network error reordering", "error");
      }
    },
    [group, groups, addToast, onGroupsChange]
  );

  const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIdx = sorted.findIndex((g) => g.id === group.id);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === sorted.length - 1;

  return (
    <div ref={popoverRef} className={styles.popover}>
      <div className={styles.popoverSection}>
        <span className={styles.popoverLabel}>Name</span>
        <input
          className={styles.popoverInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </div>

      <div className={styles.popoverSection}>
        <span className={styles.popoverLabel}>Color</span>
        <div className={styles.colorPicker}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchSelected : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.popoverSection}>
        <span className={styles.popoverLabel}>Reorder</span>
        <div className={styles.reorderRow}>
          <button
            type="button"
            className={styles.arrowBtn}
            disabled={isFirst}
            onClick={() => handleReorder("up")}
            aria-label="Move up"
          >
            &#9650;
          </button>
          <button
            type="button"
            className={styles.arrowBtn}
            disabled={isLast}
            onClick={() => handleReorder("down")}
            aria-label="Move down"
          >
            &#9660;
          </button>
        </div>
      </div>

      <div className={styles.popoverActions}>
        <button
          type="button"
          className={`${styles.popoverBtn} ${styles.popoverBtnSave}`}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? "..." : "Save"}
        </button>
        <button
          type="button"
          className={styles.popoverBtn}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>

      <div className={styles.deleteSection}>
        {confirmDelete ? (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>
              Delete group? Items won&apos;t be deleted.
            </span>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmYes}
                onClick={handleDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className={styles.confirmNo}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setConfirmDelete(true)}
          >
            Delete Group
          </button>
        )}
      </div>
    </div>
  );
}

interface GroupAssignmentDropdownProps {
  itemId: string;
  itemGroups: { id: string; name: string; color: string }[];
  allGroups: Group[];
  onAssign: () => void;
}

export function GroupAssignmentDropdown({
  itemId,
  itemGroups,
  allGroups,
  onAssign,
}: GroupAssignmentDropdownProps) {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const assignedIds = new Set(itemGroups.map((g) => g.id));

  const handleToggle = useCallback(
    async (groupId: string, isAssigned: boolean) => {
      try {
        const res = await fetch(`/api/groups/${groupId}/items`, {
          method: isAssigned ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: [itemId] }),
        });

        if (!res.ok) {
          const json = await res.json();
          addToast(json.error || "Failed to update assignment", "error");
          return;
        }

        onAssign();
      } catch {
        addToast("Network error updating assignment", "error");
      }
    },
    [itemId, addToast, onAssign]
  );

  return (
    <div ref={wrapperRef} className={styles.assignmentWrapper}>
      <button
        type="button"
        className={styles.assignmentTrigger}
        onClick={() => setOpen(!open)}
      >
        Groups ({itemGroups.length})
      </button>

      {open && (
        <div className={styles.assignmentDropdown}>
          {allGroups.length === 0 ? (
            <div className={styles.assignmentEmpty}>No groups created yet</div>
          ) : (
            allGroups.map((group) => {
              const isAssigned = assignedIds.has(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={styles.assignmentItem}
                  onClick={() => handleToggle(group.id, isAssigned)}
                >
                  <span
                    className={`${styles.assignmentCheckbox} ${isAssigned ? styles.assignmentCheckboxChecked : ""}`}
                  >
                    {isAssigned && <span className={styles.checkmark}>&#10003;</span>}
                  </span>
                  {group.color && (
                    <span
                      className={styles.assignmentDot}
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <span className={styles.assignmentName}>{group.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
