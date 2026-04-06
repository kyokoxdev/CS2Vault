"use client";

import { Card } from "@/components/ui/Card";
import ItemSearch from "@/components/ui/ItemSearch";
import styles from "./AddItemPanel.module.css";

interface AddItemPanelProps {
  onAdd: (selected: {
    hashName: string;
    name: string;
    imageUrl: string | null;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
  }) => void;
  status?: string;
}

export function AddItemPanel({ onAdd, status }: AddItemPanelProps) {
  return (
    <Card className={styles.panel} padding="md">
      <div className={styles.label}>
        Search Steam Market to add items
      </div>
      <ItemSearch
        onSelect={onAdd}
        placeholder="Type to search... e.g. AK-47 Redline, AWP Dragon Lore"
      />
      {status && (
        <div
          className={styles.statusMessage}
          data-error={status.startsWith("[ERR]")}
        >
          {status}
        </div>
      )}
    </Card>
  );
}
