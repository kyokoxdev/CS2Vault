"use client";

import { Badge } from "@/components/ui/Badge";
import type { IntelligenceStatus } from "./types";
import styles from "./QueueStatusPanel.module.css";

interface QueueStatusPanelProps {
  status: IntelligenceStatus;
  referenceTimeMs: number;
  actionPending: boolean;
  actionError: string | null;
  seedPending: boolean;
  seedError: string | null;
  seedSummary: string | null;
  refreshPending: boolean;
  refreshError: string | null;
  refreshSummary: string | null;
  canSeed: boolean;
  canRefreshStaleSignals: boolean;
  onToggleProcessing: () => void;
  onSeedCatalog: () => void;
  onRefreshStaleSignals: () => void;
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

export function QueueStatusPanel({
  status,
  referenceTimeMs,
  actionPending,
  actionError,
  seedPending,
  seedError,
  seedSummary,
  refreshPending,
  refreshError,
  refreshSummary,
  canSeed,
  canRefreshStaleSignals,
  onToggleProcessing,
  onSeedCatalog,
  onRefreshStaleSignals,
}: QueueStatusPanelProps) {
  const isPaused = status.killSwitch;
  const isBackoff = status.circuitBreaker.active;
  const actionLabel = isPaused ? "Resume Queue" : "Pause Queue";
  const pendingLabel = isPaused ? "Resuming..." : "Pausing...";
  const ariaLabel = isPaused ? "Resume signal processing" : "Pause signal processing";
  const seedDisabled = seedPending || actionPending || !canSeed;
  const refreshDisabled = refreshPending || actionPending || !canRefreshStaleSignals;

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
            onClick={onRefreshStaleSignals}
            disabled={refreshDisabled}
            aria-busy={refreshPending}
            aria-label="Refresh stale signals"
          >
            {refreshPending ? "Refreshing..." : "Refresh stale signals"}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onSeedCatalog}
            disabled={seedDisabled}
            aria-busy={seedPending}
            aria-label="Seed intelligence queue"
          >
            {seedPending ? "Seeding..." : "Seed Queue"}
          </button>
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

      {seedSummary && (
        <div className={styles.successBanner} data-testid="queue-seed-summary">
          {seedSummary}
        </div>
      )}

      {refreshSummary && (
        <div className={styles.successBanner} data-testid="queue-refresh-summary">
          {refreshSummary}
        </div>
      )}

      {seedError && (
        <div className={styles.errorBanner} data-testid="queue-seed-error">
          {seedError}
        </div>
      )}

      {refreshError && (
        <div className={styles.errorBanner} data-testid="queue-refresh-error">
          {refreshError}
        </div>
      )}

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
