"use client";

import { useEffect, useRef, useCallback } from "react";

const LAST_REFRESH_KEY = "cs2vault_last_refresh";
const STAGGER_DELAY_MS = 1500;

interface RefreshConfig {
  fn: () => void | Promise<void>;
  priority: number;
}

/**
 * Smart refresh hook that handles:
 * 1. Page Visibility API - pauses intervals when tab is hidden
 * 2. wasDiscarded detection - refreshes when browser discards and reloads tab
 * 3. Staggered refresh - spreads fetch calls to avoid burst requests
 * 4. Freshness checking - only refreshes if interval has actually passed
 */
export function useSmartRefresh(
  refreshConfigs: RefreshConfig[],
  intervalMin: number
) {
  const lastRefreshRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  const wasDiscarded = typeof document !== "undefined" && "wasDiscarded" in document
    ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded
    : false;

  const executeStaggeredRefresh = useCallback(
    (force = false) => {
      const now = Date.now();
      const lastRefresh = lastRefreshRef.current;
      const elapsed = now - lastRefresh;
      const intervalMs = intervalMin * 60 * 1000;

      // Only refresh if forced OR interval has passed
      if (!force && elapsed < intervalMs) {
        console.log(
          `[SmartRefresh] Skipping - data is fresh (${Math.round(
            elapsed / 1000
          )}s < ${intervalMs / 1000}s)`
        );
        return;
      }

      console.log(
        `[SmartRefresh] Refreshing ${refreshConfigs.length} endpoints (discarded: ${wasDiscarded})`
      );

      // Sort by priority and stagger
      const sorted = [...refreshConfigs].sort(
        (a, b) => a.priority - b.priority
      );

      sorted.forEach(({ fn, priority }) => {
        const delay = priority * STAGGER_DELAY_MS;
        setTimeout(() => {
          if (isVisibleRef.current) {
            fn();
          }
        }, delay);
      });

      lastRefreshRef.current = now;
      sessionStorage.setItem(LAST_REFRESH_KEY, now.toString());
    },
    [refreshConfigs, intervalMin]
  );

    useEffect(() => {
        if (wasDiscarded) {
            console.log(
                `[SmartRefresh] Mount refresh needed (discarded: ${wasDiscarded})`
            );
            executeStaggeredRefresh(true);
        }

        // Set up interval timer
    const setupTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

      const intervalMs = intervalMin * 60 * 1000;
      timerRef.current = setInterval(() => {
        if (isVisibleRef.current) {
          executeStaggeredRefresh();
        }
      }, intervalMs);
    };

    setupTimer();

    // Page Visibility API handler
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      isVisibleRef.current = isVisible;

      if (isVisible) {
        // Tab became visible - check if refresh is needed
        const lastTime = parseInt(
          sessionStorage.getItem(LAST_REFRESH_KEY) || "0"
        );
        const elapsed = Date.now() - lastTime;
        const intervalMs = intervalMin * 60 * 1000;

        if (elapsed >= intervalMs) {
          console.log(
            `[SmartRefresh] Tab visible, data stale (${Math.round(elapsed / 1000)}s), refreshing`
          );
          executeStaggeredRefresh(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMin, executeStaggeredRefresh]);

  return { refresh: () => executeStaggeredRefresh(true) };
}

export function markRefreshed(): void {
    sessionStorage.setItem(LAST_REFRESH_KEY, Date.now().toString());
}
