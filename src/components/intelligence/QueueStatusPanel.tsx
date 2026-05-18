"use client";

import { Badge } from "@/components/ui/Badge";
import type { IntelligenceStatus } from "./types";
import styles from "./QueueStatusPanel.module.css";

interface QueueStatusPanelProps {
  status: IntelligenceStatus;
  referenceTimeMs: number;
  actionPending: boolean;
  actionError: string | null;
  onToggleProcessing: () => void;
}

function formatRelativeTime(ts: string | null, referenceMs: number): string {
  if (!ts) return "Never";
  const diffMs = referenceMs - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function QueueStatusPanel({ status, referenceTimeMs, actionPending, actionError, onToggleProcessing }: QueueStatusPanelProps) {
  const isPaused = status.killSwitch;
  const isBackoff = status.circuitBreaker.active;
  const actionLabel = isPaused ? "Resume Queue" : "Pause Queue";
  const pendingLabel = isPaused ? "Resuming..." : "Pausing...";
  const ariaLabel = isPaused ? "Resume signal processing" : "Pause signal processing";

  return (
    <div className={styles.panel} data-testid="queue-status-panel">
      <div className={styles.header} aria-live="polite">
        <span className={styles.title}>Queue Status</span>
        {isPaused && (
          <Badge variant="danger" size="sm">Paused</Badge>
        )}
        {isBackoff && !isPaused && (
          <Badge variant="warning" size="sm">Backoff</Badge>
        )}
        {!isPaused && !isBackoff && (
          <Badge variant="success" size="sm">Active</Badge>
        )}
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onToggleProcessing}
            disabled={actionPending}
            aria-busy={actionPending}
            aria-label={ariaLabel}
          >
            {actionPending ? pendingLabel : actionLabel}
          </button>
        </div>
      </div>

      {actionError && (
        <div className={styles.errorBanner} data-testid="queue-action-error">
          {actionError}
        </div>
      )}

      {isPaused && (
        <div className={styles.warningBanner} data-testid="kill-switch-warning">
          Kill switch is active — signal detection is paused. No new signals are being processed.
        </div>
      )}

      {isBackoff && !isPaused && (
        <div className={styles.warningBanner} data-testid="circuit-breaker-warning">
          Circuit breaker active — backing off due to provider failures. Will resume after {status.circuitBreaker.until ? formatRelativeTime(status.circuitBreaker.until, referenceTimeMs) : "cooldown period"}.
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pending</span>
          <span className={styles.statValue}>{status.queue.pending}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Running</span>
          <span className={styles.statValue}>{status.queue.running}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Backoff</span>
          <span className={styles.statValue}>{status.queue.backoff}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Disabled</span>
          <span className={styles.statValue}>{status.queue.disabled}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Remaining Due</span>
          <span className={styles.statValue}>{status.remainingDue}</span>
        </div>
        {status.queue.oldestDueAgeMinutes !== null && (
          <div className={styles.stat}>
            <span className={styles.statLabel}>Oldest Due</span>
            <span className={styles.statValue}>{status.queue.oldestDueAgeMinutes}m ago</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        {status.lastRunAt && (
          <span className={styles.footerText}>Last run: {formatRelativeTime(status.lastRunAt, referenceTimeMs)}</span>
        )}
        {status.nextRecommendedPingAt && !isPaused && !isBackoff && (
          <span className={styles.footerText}>Next ping: {formatRelativeTime(status.nextRecommendedPingAt, referenceTimeMs)}</span>
        )}
        {status.lastError && (
          <span className={styles.footerError}>Last error: {status.lastError}</span>
        )}
      </div>
    </div>
  );
}
