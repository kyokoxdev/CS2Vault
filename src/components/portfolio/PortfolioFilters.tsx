"use client";

import styles from "./PortfolioFilters.module.css";
import { useState, useEffect } from "react";

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
      <select
        value={category}
        onChange={(e) => onChange("category", e.target.value)}
        className={styles.select}
      >
        <option value="">All categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat.replace("_", " ")}
          </option>
        ))}
      </select>
      <select
        value={rarity}
        onChange={(e) => onChange("rarity", e.target.value)}
        className={styles.select}
      >
        <option value="">All rarities</option>
        {rarities.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        value={price}
        onChange={(e) => onChange("price", e.target.value)}
        className={styles.select}
      >
        <option value="all">All prices</option>
        <option value="priced">Priced</option>
        <option value="unpriced">Unpriced</option>
      </select>
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
