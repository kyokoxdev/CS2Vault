/**
 * DB-backed global rate limiter using optimistic locking (CAS on lastRequestMs).
 *
 * Solves the serverless isolation problem: each Vercel isolate gets its own
 * in-memory queue, so without a shared store multiple isolates fire requests
 * concurrently and blow past external rate limits.
 */

import { prisma } from "@/lib/db";

const MAX_ACQUIRE_ATTEMPTS = 15;
const RATE_LIMIT_DEADLINE_MESSAGE = "Rate-limit slot deadline exceeded";

interface GlobalSlotOptions {
    deadlineAtMs?: number;
    minRemainingMs?: number;
}

/**
 * Acquire a rate-limit slot for `queueName`.
 * Blocks until `minDelayMs` has elapsed since the last globally-recorded
 * request, then atomically claims the next slot via CAS.
 *
 * Falls back silently on DB errors — in-memory delay + 429-retry remain.
 */
export async function acquireGlobalSlot(
    queueName: string,
    minDelayMs: number,
    options: GlobalSlotOptions = {},
): Promise<void> {
    try {
        for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
            assertDeadlineAvailable(options);
            const state = await prisma.rateLimitState.upsert({
                where: { queueName },
                create: { queueName, lastRequestMs: 0 },
                update: {},
            });

            const now = Date.now();
            const lastMs = state.lastRequestMs;
            const nextAllowed = lastMs + minDelayMs;

            if (now < nextAllowed) {
                await sleepWithinDeadline(nextAllowed - now + 50, options);
                continue;
            }

            // CAS: only succeed if no other isolate updated since our read
            const result = await prisma.rateLimitState.updateMany({
                where: { queueName, lastRequestMs: lastMs },
                data: { lastRequestMs: now },
            });

            if (result.count > 0) return;

            // Lost the race — jitter and retry
            await sleepWithinDeadline(50 + Math.random() * 150, options);
        }

        console.warn(
            `[RateLimitStore] Could not acquire slot for "${queueName}" ` +
            `after ${MAX_ACQUIRE_ATTEMPTS} attempts — proceeding`,
        );
    } catch (error) {
        if (error instanceof Error && error.message === RATE_LIMIT_DEADLINE_MESSAGE) {
            throw error;
        }
        console.warn(
            "[RateLimitStore] DB error, falling back to in-memory rate limiting:",
            error instanceof Error ? error.message : error,
        );
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function assertDeadlineAvailable(options: GlobalSlotOptions): void {
    if (options.deadlineAtMs === undefined) return;
    const minRemainingMs = options.minRemainingMs ?? 0;
    if (options.deadlineAtMs - Date.now() <= minRemainingMs) {
        throw new Error(RATE_LIMIT_DEADLINE_MESSAGE);
    }
}

async function sleepWithinDeadline(ms: number, options: GlobalSlotOptions): Promise<void> {
    if (options.deadlineAtMs !== undefined) {
        const minRemainingMs = options.minRemainingMs ?? 0;
        const remainingMs = options.deadlineAtMs - Date.now() - minRemainingMs;
        if (remainingMs <= 0 || ms > remainingMs) {
            throw new Error(RATE_LIMIT_DEADLINE_MESSAGE);
        }
    }
    await sleep(ms);
}
