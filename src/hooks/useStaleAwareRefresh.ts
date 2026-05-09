"use client";

import { useEffect, useRef } from "react";

const SESSION_PREFIX = "cs2vault_stale_";

export interface StaleAwareRefreshConfig {
  key: string;
  lastUpdated: string | null;
  intervalMin: number;
  onStale: () => void | Promise<void>;
  enabled?: boolean;
}

export function useStaleAwareRefresh({
  key,
  lastUpdated,
  intervalMin,
  onStale,
  enabled = true,
}: StaleAwareRefreshConfig): void {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const sessionKey = `${SESSION_PREFIX}${key}`;
    const alreadyRefreshed = sessionStorage.getItem(sessionKey);
    if (alreadyRefreshed) {
      return;
    }

    if (!lastUpdated) {
      sessionStorage.setItem(sessionKey, "1");
      onStale();
      return;
    }

    const elapsedMs = Date.now() - new Date(lastUpdated).getTime();
    const intervalMs = intervalMin * 60 * 1000;

    if (elapsedMs >= intervalMs) {
      sessionStorage.setItem(sessionKey, "1");
      onStale();
    }
  }, [key, lastUpdated, intervalMin, onStale, enabled]);
}
