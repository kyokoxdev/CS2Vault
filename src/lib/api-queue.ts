/**
 * Rate-limited API request queue.
 * All external API calls pass through this queue to avoid rate limiting.
 * Supports configurable delay between requests and max concurrent requests.
 */

import { acquireGlobalSlot } from "@/lib/rate-limit-store";

interface QueuedRequest<T> {
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    priority: number;
    options: ApiQueueRequestOptions;
}

export interface ApiQueueRequestOptions {
    deadlineAtMs?: number;
    minRemainingMs?: number;
    maxRetries?: number;
}

const REQUEST_DEADLINE_MESSAGE = "Request deadline exceeded";

export class ApiRequestQueue {
    private queue: QueuedRequest<unknown>[] = [];
    private processing = false;
    private lastRequestTime = 0;
    private minDelayMs: number;
    private maxRetries: number;
    private backoffMultiplier: number;
    private requestCount = 0;
    private dailyRequestCount = 0;
    private dailyResetTime = Date.now();
    private maxDailyRequests: number;
    private queueName: string | null;
    private useGlobalRateLimit: boolean;

    constructor(options: {
        minDelayMs?: number;
        maxRetries?: number;
        backoffMultiplier?: number;
        maxDailyRequests?: number;
        queueName?: string;
        useGlobalRateLimit?: boolean;
    } = {}) {
        this.minDelayMs = options.minDelayMs ?? 500;
        this.maxRetries = options.maxRetries ?? 3;
        this.backoffMultiplier = options.backoffMultiplier ?? 2;
        this.maxDailyRequests = options.maxDailyRequests ?? Infinity;
        this.queueName = options.queueName ?? null;
        this.useGlobalRateLimit = options.useGlobalRateLimit ?? false;
    }

    /**
     * Add a request to the queue. Returns a promise that resolves
     * when the request completes.
     */
    async enqueue<T>(
        execute: () => Promise<T>,
        priority: number = 0,
        options: ApiQueueRequestOptions = {}
    ): Promise<T> {
        const deadlineError = getDeadlineError(options);
        if (deadlineError) throw deadlineError;

        // Check daily limit
        this.resetDailyCounterIfNeeded();
        if (this.dailyRequestCount >= this.maxDailyRequests) {
            throw new Error(
                `Daily request limit reached (${this.maxDailyRequests}). Resets at midnight.`
            );
        }

        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                execute: execute as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject,
                priority,
                options,
            });

            // Sort by priority (higher = first)
            this.queue.sort((a, b) => b.priority - a.priority);

            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift();
            if (!request) break;

            const deadlineError = getDeadlineError(request.options);
            if (deadlineError) {
                request.reject(deadlineError);
                continue;
            }

            // Enforce delay — DB-backed global limiter or in-memory fallback
            if (this.useGlobalRateLimit && this.queueName) {
                try {
                    await acquireGlobalSlot(this.queueName, this.minDelayMs, request.options);
                } catch (error) {
                    request.reject(error);
                    continue;
                }
            } else {
                const elapsed = Date.now() - this.lastRequestTime;
                if (elapsed < this.minDelayMs) {
                    const waitMs = this.minDelayMs - elapsed;
                    if (!canWaitWithinDeadline(waitMs, request.options)) {
                        request.reject(new Error(REQUEST_DEADLINE_MESSAGE));
                        continue;
                    }
                    await this.sleep(waitMs);
                }
            }

            const beforeExecuteDeadlineError = getDeadlineError(request.options);
            if (beforeExecuteDeadlineError) {
                request.reject(beforeExecuteDeadlineError);
                continue;
            }

            // Count this request once (not per retry)
            this.requestCount++;
            this.dailyRequestCount++;

            // Execute with retry logic
            let lastError: unknown;
            const maxRetries = request.options.maxRetries ?? this.maxRetries;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    this.lastRequestTime = Date.now();
                    const result = await request.execute();
                    request.resolve(result);
                    lastError = undefined;
                    break;
                } catch (error: unknown) {
                    lastError = error;

                    // Check if it's a rate limit error (429)
                    if (isRateLimitError(error) && attempt < maxRetries) {
                        const backoffMs =
                            this.minDelayMs *
                            Math.pow(this.backoffMultiplier, attempt + 1) +
                            Math.random() * 1000; // jitter
                        if (!canWaitWithinDeadline(backoffMs, request.options)) {
                            lastError = new Error(`${REQUEST_DEADLINE_MESSAGE} before retry`);
                            break;
                        }
                        console.warn(
                            `[ApiQueue] Rate limited (attempt ${attempt + 1}/${maxRetries}). ` +
                            `Backing off ${Math.round(backoffMs)}ms...`
                        );
                        await this.sleep(backoffMs);
                    } else {
                        break;
                    }
                }
            }

            if (lastError) {
                request.reject(lastError);
            }
        }

        this.processing = false;
    }

    private resetDailyCounterIfNeeded(): void {
        const now = Date.now();
        const msPerDay = 24 * 60 * 60 * 1000;
        if (now - this.dailyResetTime >= msPerDay) {
            this.dailyRequestCount = 0;
            this.dailyResetTime = now;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }

    /** Get current queue stats */
    getStats() {
        return {
            queueLength: this.queue.length,
            totalRequests: this.requestCount,
            dailyRequests: this.dailyRequestCount,
            isProcessing: this.processing,
        };
    }

    /** Clear all pending requests */
    clear(): void {
        for (const req of this.queue) {
            req.reject(new Error("Queue cleared"));
        }
        this.queue = [];
    }
}

function getDeadlineError(options: ApiQueueRequestOptions): Error | null {
    if (options.deadlineAtMs === undefined) return null;
    const minRemainingMs = options.minRemainingMs ?? 0;
    return options.deadlineAtMs - Date.now() <= minRemainingMs
        ? new Error(REQUEST_DEADLINE_MESSAGE)
        : null;
}

function canWaitWithinDeadline(waitMs: number, options: ApiQueueRequestOptions): boolean {
    if (options.deadlineAtMs === undefined) return true;
    const minRemainingMs = options.minRemainingMs ?? 0;
    return waitMs <= options.deadlineAtMs - Date.now() - minRemainingMs;
}

// ─── Rate-limit error detection (shared utility) ───────

const RATE_LIMIT_PATTERNS = [
    "429",
    "rate limit",
    "rate-limit",
    "too many requests",
    "resource has been exhausted",
    "quota exceeded",
    "quota_exceeded",
    "rateLimitExceeded",
    "requests per minute",
    "requests per day",
];

/**
 * Check if an error indicates a rate limit / quota exceeded response.
 * Works with HTTP 429, Google API quota errors, and generic rate limit messages.
 */
export function isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return RATE_LIMIT_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
    }
    if (typeof error === "object" && error !== null && "status" in error) {
        return (error as { status: number }).status === 429;
    }
    return false;
}

// ─── Pre-configured queues per provider ─────────────────

/** Pricempire: 30K/month ≈ 1K/day, conservative 1 req/s */
export const pricempireQueue = new ApiRequestQueue({
    queueName: "pricempire",
    useGlobalRateLimit: true,
    minDelayMs: 1000,
    maxRetries: 3,
    maxDailyRequests: 1000,
});

/** CSFloat: no published limits, conservative 1 req/2s */
export const csfloatQueue = new ApiRequestQueue({
    queueName: "csfloat",
    useGlobalRateLimit: true,
    minDelayMs: 2000,
    maxRetries: 4,
    maxDailyRequests: 5000,
});

/** Steam Market: ~20 req/min, 1 req/3s to be safe */
export const steamQueue = new ApiRequestQueue({
    queueName: "steam",
    useGlobalRateLimit: true,
    minDelayMs: 3000,
    maxRetries: 3,
    maxDailyRequests: 500,
});

/** CSGOTrader: bulk JSON fetch, conservative 1 req/5s */
export const csgotraderQueue = new ApiRequestQueue({
    queueName: "csgotrader",
    useGlobalRateLimit: true,
    minDelayMs: 5000,
    maxRetries: 3,
    maxDailyRequests: 1000,
});

/** Gemini Flash */
export const geminiFlashQueue = new ApiRequestQueue({
    queueName: "gemini-flash",
    useGlobalRateLimit: true,
    minDelayMs: 2000,
    maxRetries: 5,
    maxDailyRequests: 10000,
});
