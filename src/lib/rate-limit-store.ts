/**
 * DB-backed global rate limiter using optimistic locking (CAS on lastRequestMs).
 *
 * Solves the serverless isolation problem: each Vercel isolate gets its own
 * in-memory queue, so without a shared store multiple isolates fire requests
 * concurrently and blow past external rate limits.
 */

import { prisma } from "@/lib/db";

const MAX_ACQUIRE_ATTEMPTS = 15;

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
): Promise<void> {
    try {
        for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
            const state = await prisma.rateLimitState.upsert({
                where: { queueName },
                create: { queueName, lastRequestMs: 0 },
                update: {},
            });

            const now = Date.now();
            const lastMs = state.lastRequestMs;
            const nextAllowed = lastMs + minDelayMs;

            if (now < nextAllowed) {
                await sleep(nextAllowed - now + 50);
                continue;
            }

            // CAS: only succeed if no other isolate updated since our read
            const result = await prisma.rateLimitState.updateMany({
                where: { queueName, lastRequestMs: lastMs },
                data: { lastRequestMs: now },
            });

            if (result.count > 0) return;

            // Lost the race — jitter and retry
            await sleep(50 + Math.random() * 150);
        }

        console.warn(
            `[RateLimitStore] Could not acquire slot for "${queueName}" ` +
            `after ${MAX_ACQUIRE_ATTEMPTS} attempts — proceeding`,
        );
    } catch (error) {
        console.warn(
            "[RateLimitStore] DB error, falling back to in-memory rate limiting:",
            error instanceof Error ? error.message : error,
        );
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
