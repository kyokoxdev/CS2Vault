"use client";

import { useMemo } from "react";
import styles from "./IndicatorPanel.module.css";
import { indicatorRegistry, type IndicatorRegistryEntry } from "@/lib/indicators/indicator-registry";

interface IndicatorPanelProps {
  activeIndicators: string[];
  onToggle: (indicatorId: string) => void;
  onInputChange?: (indicatorId: string, inputKey: string, value: number) => void;
  allowedIndicatorIds?: string[];
  compact?: boolean;
}

export function IndicatorPanel({ activeIndicators, onToggle, onInputChange, allowedIndicatorIds, compact }: IndicatorPanelProps) {
  const allowedIndicatorSet = useMemo(
    () => allowedIndicatorIds ? new Set(allowedIndicatorIds) : null,
    [allowedIndicatorIds]
  );

  const overlayIndicators = useMemo(() => 
    indicatorRegistry.filter(ind => ind.category === "overlay" && (!allowedIndicatorSet || allowedIndicatorSet.has(ind.id))), 
    [allowedIndicatorSet]
  );
  
  const oscillatorIndicators = useMemo(() => 
    indicatorRegistry.filter(ind => ind.category === "oscillator" && (!allowedIndicatorSet || allowedIndicatorSet.has(ind.id))), 
    [allowedIndicatorSet]
  );

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ""}`}>
      <div className={styles.category}>
        <h4 className={styles.categoryTitle}>Overlay</h4>
        {overlayIndicators.map(indicator => (
          <IndicatorRow 
            key={indicator.id}
            indicator={indicator}
            isActive={activeIndicators.includes(indicator.id)}
            onToggle={() => onToggle(indicator.id)}
            onInputChange={onInputChange}
            compact={compact}
          />
        ))}
      </div>
      
      {oscillatorIndicators.length > 0 && (
        <div className={styles.category}>
          <h4 className={styles.categoryTitle}>Oscillator</h4>
          {oscillatorIndicators.map(indicator => (
            <IndicatorRow 
              key={indicator.id}
              indicator={indicator}
              isActive={activeIndicators.includes(indicator.id)}
              onToggle={() => onToggle(indicator.id)}
              onInputChange={onInputChange}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface IndicatorRowProps {
  indicator: IndicatorRegistryEntry;
  isActive: boolean;
  onToggle: () => void;
  onInputChange?: (indicatorId: string, inputKey: string, value: number) => void;
  compact?: boolean;
}

function IndicatorRow({ indicator, isActive, onToggle, onInputChange, compact }: IndicatorRowProps) {
  const hasInputs = Object.keys(indicator.defaultInputs).length > 0;
  
  return (
    <div className={`${styles.indicatorRow} ${compact ? styles.indicatorRowCompact : ""}`}>
      <div className={styles.indicatorInfo}>
        <span className={styles.indicatorName}>{indicator.shortName}</span>
        {!compact && <span className={styles.indicatorDescription}>{indicator.description}</span>}
      </div>
      
      <button
        type="button"
        className={`${styles.toggleButton} ${isActive ? styles.active : ""}`}
        aria-pressed={isActive}
        onClick={onToggle}
        aria-label={`Toggle ${indicator.name}`}
      >
        {isActive ? "On" : "Off"}
      </button>
      
      {isActive && hasInputs && onInputChange && (
        <div className={styles.inputs}>
          {Object.entries(indicator.defaultInputs).map(([key, defaultValue]) => (
            <div key={key} className={styles.inputGroup}>
              <label className={styles.inputLabel}>{key}</label>
              <input
                type="number"
                defaultValue={defaultValue}
                className={styles.input}
                onChange={(e) => onInputChange(indicator.id, key, parseInt(e.target.value, 10))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
