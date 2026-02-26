/**
 * Sync Scheduler
 *
 * Manages periodic data syncing using configurable intervals.
 * Uses setTimeout-based scheduling instead of node-cron for simplicity
 * in the Next.js environment (cron libraries can conflict with serverless).
 */

import { prisma } from "@/lib/db";
import { runSync } from "@/lib/market/sync";
import { initializeMarketProviders } from "@/lib/market/init";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

/**
 * Start the sync scheduler. Reads interval from AppSettings.
 */
export async function startScheduler(): Promise<void> {
    if (isRunning) {
        console.log("[Scheduler] Already running");
        return;
    }

    // Ensure providers are initialized
    initializeMarketProviders();

    isRunning = true;
    console.log("[Scheduler] ✅ Started");

    // Run immediately, then schedule
    await runScheduledSync();
}

/**
 * Stop the sync scheduler.
 */
export function stopScheduler(): void {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }
    isRunning = false;
    console.log("[Scheduler] 🛑 Stopped");
}

/**
 * Run a sync and schedule the next one.
 */
async function runScheduledSync(): Promise<void> {
    if (!isRunning) return;

    try {
        const result = await runSync();
        console.log(
            `[Scheduler] Sync complete: ${result.status} — ` +
            `${result.itemCount} items in ${result.duration}ms`
        );
    } catch (error) {
        console.error("[Scheduler] Sync failed:", error);
    }

    // Schedule next sync based on current settings
    if (isRunning) {
        const settings = await prisma.appSettings.findUnique({
            where: { id: "singleton" },
        });
        const intervalMs = (settings?.syncIntervalMin ?? 5) * 60 * 1000;

        schedulerTimer = setTimeout(() => {
            runScheduledSync();
        }, intervalMs);

        console.log(`[Scheduler] Next sync in ${settings?.syncIntervalMin ?? 5} minutes`);
    }
}

/**
 * Trigger a manual sync (outside the scheduler).
 */
export async function triggerManualSync(): Promise<ReturnType<typeof runSync>> {
    initializeMarketProviders();
    return runSync();
}

/**
 * Get scheduler status.
 */
export function getSchedulerStatus() {
    return {
        isRunning,
        hasTimer: schedulerTimer !== null,
    };
}
