"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { useReducedMotion } from "@/hooks/useMediaQuery";

import { SummaryCards } from "./SummaryCards";
import { SignalFilters } from "./SignalFilters";
import { SignalCard } from "./SignalCard";
import { QueueStatusPanel } from "./QueueStatusPanel";
import type { IntelligenceRefreshResponse, IntelligenceSignal, IntelligenceStatus, SignalFilters as Filters } from "./types";
import styles from "./IntelligenceDashboard.module.css";

const DEFAULT_FILTERS: Filters = {
  signalType: "",
  tier: "",
  freshness: "",
};

const SEED_BATCH_CAP = 100;
const MAX_SEED_BATCHES_PER_CLICK = 3;

interface SeedProgress {
  hasMore: boolean;
  nextCursor: number | null;
}

interface SeedResponse {
  success: boolean;
  data?: {
    seeded: number;
    disabled: number;
    skipped: number;
    progress: SeedProgress;
  };
  error?: string;
}

function buildSignalsUrl(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.signalType) params.set("signalType", filters.signalType);
  if (filters.tier) params.set("tier", filters.tier);
  if (filters.freshness) params.set("freshness", filters.freshness);
  const qs = params.toString();
  return `/api/intelligence/signals${qs ? `?${qs}` : ""}`;
}

export function IntelligenceDashboard() {
  const [signals, setSignals] = useState<IntelligenceSignal[]>([]);
  const [status, setStatus] = useState<IntelligenceStatus | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusActionPending, setStatusActionPending] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [seedActionPending, setSeedActionPending] = useState(false);
  const [seedActionError, setSeedActionError] = useState<string | null>(null);
  const [seedActionSummary, setSeedActionSummary] = useState<string | null>(null);
  const [refreshActionPending, setRefreshActionPending] = useState(false);
  const [refreshActionError, setRefreshActionError] = useState<string | null>(null);
  const [refreshActionSummary, setRefreshActionSummary] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [referenceTimeMs] = useState(() => Date.now());
  const seedInFlightRef = useRef(false);
  const reducedMotion = useReducedMotion();

  const fetchSignals = useCallback(async (currentFilters: Filters, cursor?: string) => {
    try {
      let url = buildSignalsUrl(currentFilters);
      if (cursor) {
        const sep = url.includes("?") ? "&" : "?";
        url = `${url}${sep}cursor=${encodeURIComponent(cursor)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error ?? "Failed to fetch signals");
      }
      if (cursor) {
        setSignals((prev) => [...prev, ...data.data.items]);
      } else {
        setSignals(data.data.items);
      }
      setHasMore(data.data.meta.hasMore);
      setNextCursor(data.data.meta.nextCursor);
    } catch (err) {
      console.error("[IntelligenceDashboard] signals fetch error:", err);
      throw err;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence/status");
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error("[IntelligenceDashboard] status fetch error:", err);
    }
  }, []);

  const loadAll = useCallback(async (currentFilters: Filters) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchSignals(currentFilters), fetchStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load intelligence data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [fetchSignals, fetchStatus]);

  useEffect(() => {
    loadAll(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      loadAll(next);
      return next;
    });
  }, [loadAll]);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    loadAll(DEFAULT_FILTERS);
  }, [loadAll]);

  const handleRetry = useCallback(() => {
    loadAll(filters);
  }, [loadAll, filters]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor) return;
    try {
      await fetchSignals(filters, nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more signals.");
    }
  }, [fetchSignals, filters, nextCursor]);

  const handleToggleProcessing = useCallback(async () => {
    if (!status) return;

    setStatusActionPending(true);
    setStatusActionError(null);
    try {
      const action = status.killSwitch ? "resume" : "pause";
      const res = await fetch("/api/intelligence/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error(data.error ?? "Failed to update queue status");
      }
      setStatus(data.data);
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : "Failed to update queue status");
    } finally {
      setStatusActionPending(false);
    }
  }, [status]);

  const handleSeedCatalog = useCallback(async () => {
    if (seedInFlightRef.current || !status || status.queue.running > 0) return;

    seedInFlightRef.current = true;
    setSeedActionPending(true);
    setSeedActionError(null);
    setSeedActionSummary(null);

    try {
      let cursor: number | null = null;
      let hasMoreCatalogEntries = false;
      let seeded = 0;
      let disabled = 0;
      let skipped = 0;

      for (let batch = 0; batch < MAX_SEED_BATCHES_PER_CLICK; batch += 1) {
        const body = cursor === null
          ? { cap: SEED_BATCH_CAP }
          : { cap: SEED_BATCH_CAP, cursor };
        const res = await fetch("/api/intelligence/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json() as SeedResponse;

        if (!data.success || !data.data) {
          throw new Error(data.error ?? "Catalog seeding failed");
        }

        seeded += data.data.seeded;
        disabled += data.data.disabled;
        skipped += data.data.skipped;
        hasMoreCatalogEntries = data.data.progress.hasMore;

        if (!hasMoreCatalogEntries || typeof data.data.progress.nextCursor !== "number") {
          break;
        }

        cursor = data.data.progress.nextCursor;
      }

      setSeedActionSummary(
        hasMoreCatalogEntries
          ? `Seeded ${seeded} entries. More entries are available; click again to continue.`
          : `Seeded ${seeded} entries. Disabled ${disabled}. Skipped ${skipped}.`
      );
      await fetchStatus();
    } catch (err) {
      setSeedActionError(err instanceof Error ? err.message : "Catalog seeding failed");
    } finally {
      seedInFlightRef.current = false;
      setSeedActionPending(false);
    }
  }, [fetchStatus, status]);

  const handleRefreshStaleSignals = useCallback(async () => {
    if (refreshActionPending) return;

    setRefreshActionPending(true);
    setRefreshActionError(null);
    setRefreshActionSummary(null);

    try {
      const res = await fetch("/api/intelligence/refresh", { method: "POST" });
      const data = await res.json() as IntelligenceRefreshResponse;

      if (!data.success || !data.data) {
        throw new Error(data.error ?? "Intelligence refresh failed");
      }

      let summary = `Promoted ${data.data.promoted} stale signal rows. Processed ${data.data.processed}.`;
      if (data.data.lanes) {
        const { scmHot, scmDiscovery, csfloatScout } = data.data.lanes;
        summary += ` (Hot: ${scmHot.processed}, Discovery: ${scmDiscovery.processed}, Scout: ${csfloatScout.processed})`;
      }
      
      setRefreshActionSummary(summary);
      await loadAll(filters);
    } catch (err) {
      setRefreshActionError(err instanceof Error ? err.message : "Intelligence refresh failed");
    } finally {
      setRefreshActionPending(false);
    }
  }, [filters, loadAll, refreshActionPending]);

  const hasStaleSignals = signals.some(
    (s) => s.freshness === "stale" || s.freshness === "expired"
  );
  const canSeed = status ? !seedActionPending && status.queue.running === 0 : false;
  const canRefreshStaleSignals = status
    ? hasStaleSignals && !status.killSwitch && !status.circuitBreaker.active && status.queue.running === 0
    : false;

  if (loading) {
    return (
      <div className={styles.container} data-testid="intelligence-dashboard">
        <div className={styles.skeletonRow}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
        <div className={styles.skeletonCardRow}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="intelligence-dashboard">
      {error && (
        <div className={styles.errorBanner} data-testid="error-banner">
          <span className={styles.errorMessage}>{error}</span>
          <button type="button" className={styles.errorRetryBtn} onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}

      {hasStaleSignals && !error && (
        <div className={styles.staleBanner} data-testid="stale-warning">
          Some signals are stale or expired. Data may not reflect current market conditions.
        </div>
      )}

      <SummaryCards signals={signals} status={status} />

      {status && (
        <QueueStatusPanel
          status={status}
          referenceTimeMs={referenceTimeMs}
          actionPending={statusActionPending}
          actionError={statusActionError}
          seedPending={seedActionPending}
          seedError={seedActionError}
          seedSummary={seedActionSummary}
          refreshPending={refreshActionPending}
          refreshError={refreshActionError}
          refreshSummary={refreshActionSummary}
          canSeed={canSeed}
          canRefreshStaleSignals={canRefreshStaleSignals}
          onToggleProcessing={handleToggleProcessing}
          onSeedCatalog={handleSeedCatalog}
          onRefreshStaleSignals={handleRefreshStaleSignals}
        />
      )}

      <SignalFilters filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} />

      {signals.length === 0 && !error ? (
        <div className={styles.emptyState} data-testid="empty-state">
          <span className={styles.emptyIcon}>📡</span>
          <span>No signals detected yet</span>
          <span className={styles.emptySubtext}>Signals will appear here when market anomalies are identified.</span>
        </div>
      ) : (
        <div
          className={styles.signalList}
          data-testid="intelligence-radar"
          data-reduced-motion={reducedMotion ? "true" : undefined}
        >
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} referenceTimeMs={referenceTimeMs} />
          ))}
        </div>
      )}

      {hasMore && nextCursor && (
        <div className={styles.loadMoreRow}>
          <button type="button" className={styles.loadMoreBtn} onClick={handleLoadMore}>
            Load more signals
          </button>
        </div>
      )}
    </div>
  );
}
