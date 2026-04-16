import { prisma } from "@/lib/db";

const LOCK_STALE_MINUTES = 6; // Must be slightly above maxDuration (300s = 5min)

export async function acquireSyncLock(): Promise<boolean> {
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
        select: { syncInProgress: true, syncStartedAt: true },
    });

    if (settings?.syncInProgress && settings.syncStartedAt) {
        const ageMs = Date.now() - settings.syncStartedAt.getTime();
        if (ageMs < LOCK_STALE_MINUTES * 60 * 1000) {
            return false;
        }
        console.warn(`[SyncLock] Stale lock detected (${Math.round(ageMs / 1000)}s old) — overriding`);
    }

    await prisma.appSettings.update({
        where: { id: "singleton" },
        data: { syncInProgress: true, syncStartedAt: new Date() },
    });

    return true;
}

export async function releaseSyncLock(): Promise<void> {
    try {
        await prisma.appSettings.update({
            where: { id: "singleton" },
            data: { syncInProgress: false, syncStartedAt: null },
        });
    } catch (error) {
        console.error("[SyncLock] Failed to release lock:", error instanceof Error ? error.message : error);
    }
}

export async function isSyncLocked(): Promise<boolean> {
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
        select: { syncInProgress: true, syncStartedAt: true },
    });

    if (!settings?.syncInProgress || !settings.syncStartedAt) return false;

    const ageMs = Date.now() - settings.syncStartedAt.getTime();
    return ageMs < LOCK_STALE_MINUTES * 60 * 1000;
}
