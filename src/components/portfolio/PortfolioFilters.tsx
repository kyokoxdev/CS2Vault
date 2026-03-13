"use client";

import styles from "./PortfolioFilters.module.css";
import { useState, useEffect } from "react";
import { Select } from "@/components/ui/Select";

interface PortfolioFiltersProps {
  category: string;
  rarity: string;
  search: string;
  price: string;
  filterOptions?: {
    categories: string[];
    rarities: string[];
  };
  itemCount: number;
  onChange: (field: string, value: string) => void;
  onClear: () => void;
}

export function PortfolioFilters({
  category,
  rarity,
  search,
  price,
  filterOptions,
  itemCount,
  onChange,
  onClear,
}: PortfolioFiltersProps) {
  const [pendingSearch, setPendingSearch] = useState(search);
  const categories = filterOptions?.categories ?? [];
  const rarities = filterOptions?.rarities ?? [];

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
          ...categories.map(cat => ({ label: cat.replace("_", " "), value: cat }))
        ]}
        className={styles.select}
      />
      <Select
        value={rarity}
        onChange={(val) => onChange("rarity", val)}
        options={[
          { label: "All rarities", value: "" },
          ...rarities.map(r => ({ label: r, value: r }))
        ]}
        className={styles.select}
      />
      <Select
        value={price}
        onChange={(val) => onChange("price", val)}
        options={[
          { label: "All prices", value: "all" },
          { label: "Priced", value: "priced" },
          { label: "Unpriced", value: "unpriced" }
        ]}
        className={styles.select}
      />
      <input
        value={pendingSearch}
        onChange={(e) => setPendingSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onChange("search", pendingSearch.trim());
          }
        }}
        placeholder="Search items"
        className={styles.input}
      />
      <button
        onClick={() => onChange("search", pendingSearch.trim())}
        className={styles.button}
      >
        Apply
      </button>
      <button onClick={onClear} className={styles.clearButton}>
        Clear
      </button>
      <div className={styles.count}>{itemCount} items</div>
    </div>
  );
}
