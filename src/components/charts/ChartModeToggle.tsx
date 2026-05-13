import styles from "./ChartModeToggle.module.css";

interface ChartModeToggleProps {
  mode: "regular" | "advanced";
  onModeChange: (mode: "regular" | "advanced") => void;
  disabled?: boolean;
}

export function ChartModeToggle({ mode, onModeChange, disabled = false }: ChartModeToggleProps) {
  return (
    <div className={styles.toggleGroup} role="group" aria-label="Chart mode">
      <button
        type="button"
        className={`${styles.toggleButton} ${mode === "regular" ? styles.active : ""}`}
        aria-label="Regular mode"
        aria-pressed={mode === "regular"}
        onClick={() => onModeChange("regular")}
        disabled={disabled}
      >
        Regular
      </button>
      <button
        type="button"
        className={`${styles.toggleButton} ${mode === "advanced" ? styles.active : ""}`}
        aria-label="Advanced mode"
        aria-pressed={mode === "advanced"}
        onClick={() => onModeChange("advanced")}
        disabled={disabled}
      >
        Advanced
      </button>
    </div>
  );
}
