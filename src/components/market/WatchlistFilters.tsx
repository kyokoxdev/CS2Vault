"use client";

import styles from "./WatchlistFilters.module.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { Select } from "@/components/ui/Select";

interface WatchlistFiltersProps {
  category: string;
  rarity: string;
  search: string;
  group: string;
  filterOptions: {
    categories: string[];
    rarities: string[];
    groups: { id: string; name: string }[];
  };
  itemCount: number;
  totalCount: number;
  onChange: (field: string, value: string) => void;
  onClear: () => void;
}

export function WatchlistFilters({
  category,
  rarity,
  search,
  group,
  filterOptions,
  itemCount,
  totalCount,
  onChange,
  onClear,
}: WatchlistFiltersProps) {
  const [pendingSearch, setPendingSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = filterOptions.categories;
  const rarities = filterOptions.rarities;
  const groups = filterOptions.groups;

  const hasActiveFilters =
    category !== "" || rarity !== "" || search !== "" || group !== "";

  const debouncedOnChange = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChange("search", value.trim());
      }, 300);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPendingSearch(search);
  }, [search]);

  return (
    <div className={styles.container}>
      <div className={styles.label}>Filters</div>
      <Select
        value={category}
        onChange={(val) => onChange("category", val)}
        options={[
          { label: "All categories", value: "" },
          ...categories.map((cat) => ({
            label: cat.replace("_", " "),
            value: cat,
          })),
        ]}
        className={styles.select}
      />
      <Select
        value={rarity}
        onChange={(val) => onChange("rarity", val)}
        options={[
          { label: "All rarities", value: "" },
          ...rarities.map((r) => ({ label: r, value: r })),
        ]}
        className={styles.select}
      />
      <Select
        value={group}
        onChange={(val) => onChange("group", val)}
        options={[
          { label: "All groups", value: "" },
          ...groups.map((g) => ({ label: g.name, value: g.id })),
        ]}
        className={styles.select}
      />
      <input
        value={pendingSearch}
        onChange={(e) => {
          const value = e.target.value;
          setPendingSearch(value);
          debouncedOnChange(value);
        }}
        placeholder="Search items..."
        className={styles.input}
        aria-label="Search watchlist items"
      />
      {hasActiveFilters && (
        <button type="button" onClick={onClear} className={styles.clearButton}>
          Clear Filters
        </button>
      )}
      <div className={styles.count}>
        Showing {itemCount} of {totalCount} items
      </div>
    </div>
  );
}
