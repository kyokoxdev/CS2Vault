"use client";

import styles from "./PortfolioFilters.module.css";
import { useState, useEffect } from "react";
import { FaFilter, FaChevronDown } from "react-icons/fa";
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
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const categories = filterOptions?.categories ?? [];
  const rarities = filterOptions?.rarities ?? [];

  const hasActiveFilters = Boolean(
    category || rarity || search || (price && price !== "all")
  );
  const activeFilterCount = [category, rarity, search, price !== "all" ? price : ""].filter(Boolean).length;

  useEffect(() => {
    setPendingSearch(search);
  }, [search]);

  return (
    <div className={`${styles.container}${mobileExpanded ? ` ${styles.containerExpanded}` : ""}`}>
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setMobileExpanded((prev) => !prev)}
        aria-expanded={mobileExpanded}
      >
        <span className={styles.mobileToggleLeft}>
          <FaFilter className={styles.mobileToggleIcon} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className={styles.mobileFilterBadge}>{activeFilterCount}</span>
          )}
        </span>
        <span className={styles.mobileToggleRight}>
          <span className={styles.mobileToggleCount}>{itemCount} items</span>
          <FaChevronDown className={`${styles.mobileChevron}${mobileExpanded ? ` ${styles.mobileChevronOpen}` : ""}`} />
        </span>
      </button>

      <div className={styles.desktopLabel}>Filters</div>
      <div className={styles.filterBody}>
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
          aria-label="Search items"
        />
        <button
          type="button"
          onClick={() => onChange("search", pendingSearch.trim())}
          className={styles.button}
        >
          Apply
        </button>
        {hasActiveFilters && (
          <button type="button" onClick={onClear} className={styles.clearButton}>
            Clear
          </button>
        )}
      </div>
      <div className={styles.count}>{itemCount} items</div>
    </div>
  );
}
