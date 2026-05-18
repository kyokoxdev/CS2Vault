"use client";

import styles from "./SignalFilters.module.css";
import type { SignalFilters as Filters } from "./types";

interface SignalFiltersProps {
  filters: Filters;
  onChange: (key: keyof Filters, value: string) => void;
  onClear: () => void;
}

const SIGNAL_TYPES = [
  { value: "", label: "All Types" },
  { value: "accumulation", label: "Accumulation" },
  { value: "pump", label: "Pump" },
  { value: "dump", label: "Dump" },
  { value: "neutral", label: "Neutral" },
];

const TIERS = [
  { value: "", label: "All Tiers" },
  { value: "low_supply_discontinued", label: "Low-supply / discontinued" },
  { value: "liquid", label: "Liquid" },
  { value: "standard", label: "Standard" },
];

const FRESHNESS_OPTIONS = [
  { value: "", label: "All Freshness" },
  { value: "fresh", label: "Fresh" },
  { value: "stale", label: "Stale" },
  { value: "expired", label: "Expired" },
];

export function SignalFilters({ filters, onChange, onClear }: SignalFiltersProps) {
  const hasActiveFilters = filters.signalType !== "" || filters.tier !== "" || filters.freshness !== "";

  return (
    <div className={styles.container} data-testid="signal-filters">
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel} htmlFor="signal-type-filter">Type</label>
        <select
          id="signal-type-filter"
          className={styles.select}
          value={filters.signalType}
          onChange={(e) => onChange("signalType", e.target.value)}
        >
          {SIGNAL_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel} htmlFor="tier-filter">Tier</label>
        <select
          id="tier-filter"
          className={styles.select}
          value={filters.tier}
          onChange={(e) => onChange("tier", e.target.value)}
        >
          {TIERS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel} htmlFor="freshness-filter">Freshness</label>
        <select
          id="freshness-filter"
          className={styles.select}
          value={filters.freshness}
          onChange={(e) => onChange("freshness", e.target.value)}
        >
          {FRESHNESS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={onClear}
          aria-label="Clear all filters"
        >
          Clear
        </button>
      )}
    </div>
  );
}