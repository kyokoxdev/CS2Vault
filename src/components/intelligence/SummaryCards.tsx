"use client";

import { Card } from "@/components/ui/Card";
import styles from "./SummaryCards.module.css";
import type { IntelligenceSignal, IntelligenceStatus } from "./types";

interface SummaryCardsProps {
  signals: IntelligenceSignal[];
  status: IntelligenceStatus | null;
}

export function SummaryCards({ signals, status }: SummaryCardsProps) {
  const totalSignals = signals.length;
  const highConfidence = signals.filter((s) => s.confidence >= 80).length;
  const staleCount = signals.filter((s) => s.freshness === "stale" || s.freshness === "expired").length;

  return (
    <div className={styles.row} data-testid="summary-cards">
      <Card padding="md" animate>
        <div className={styles.cardContent}>
          <div className={styles.label}>Signals Detected</div>
          <div className={styles.value}>{totalSignals}</div>
          <div className={styles.subtext}>Active anomaly signals</div>
        </div>
      </Card>

      <Card padding="md" animate>
        <div className={styles.cardContent}>
          <div className={styles.label}>High Confidence</div>
          <div className={styles.value}>{highConfidence}</div>
          <div className={styles.subtext}>Confidence ≥ 80%</div>
        </div>
      </Card>

      <Card padding="md" animate>
        <div className={styles.cardContent}>
          <div className={styles.label}>Stale / Backlog</div>
          <div className={`${styles.value}${staleCount > 0 ? ` ${styles.valueWarning}` : ""}`}>
            {staleCount}
          </div>
          <div className={styles.subtext}>
            {staleCount > 0 ? "Some signals need refresh" : "All signals fresh"}
          </div>
        </div>
      </Card>

      {status && (
        <Card padding="md" animate>
          <div className={styles.cardContent}>
            <div className={styles.label}>Queue Status</div>
            <div className={styles.value}>
              {status.killSwitch ? "Paused" : status.circuitBreaker.active ? "Backoff" : "Active"}
            </div>
            <div className={styles.subtext}>
              {status.remainingDue} due · {status.queue.running} running
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
