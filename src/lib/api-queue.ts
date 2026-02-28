/**
 * Rate-limited API request queue.
 * All external API calls pass through this queue to avoid rate limiting.
 * Supports configurable delay between requests and max concurrent requests.
 */

interface QueuedRequest<T> {
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    priority: number;
}

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

    constructor(options: {
        minDelayMs?: number;     // Min delay between requests (default 500ms)
        maxRetries?: number;     // Max retries on 429 (default 3)
        backoffMultiplier?: number;
        maxDailyRequests?: number;
    } = {}) {
        this.minDelayMs = options.minDelayMs ?? 500;
        this.maxRetries = options.maxRetries ?? 3;
        this.backoffMultiplier = options.backoffMultiplier ?? 2;
        this.maxDailyRequests = options.maxDailyRequests ?? Infinity;
    }

    /**
     * Add a request to the queue. Returns a promise that resolves
     * when the request completes.
     */
    async enqueue<T>(
        execute: () => Promise<T>,
        priority: number = 0
    ): Promise<T> {
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

            // Wait for minimum delay
            const elapsed = Date.now() - this.lastRequestTime;
            if (elapsed < this.minDelayMs) {
                await this.sleep(this.minDelayMs - elapsed);
            }

            // Count this request once (not per retry)
            this.requestCount++;
            this.dailyRequestCount++;

            // Execute with retry logic
            let lastError: unknown;
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
                try {
                    this.lastRequestTime = Date.now();
                    const result = await request.execute();
                    request.resolve(result);
                    lastError = undefined;
                    break;
                } catch (error: unknown) {
                    lastError = error;

                    // Check if it's a rate limit error (429)
                    if (this.isRateLimitError(error) && attempt < this.maxRetries) {
                        const backoffMs =
                            this.minDelayMs *
                            Math.pow(this.backoffMultiplier, attempt + 1) +
                            Math.random() * 1000; // jitter
                        console.warn(
                            `[ApiQueue] Rate limited (attempt ${attempt + 1}/${this.maxRetries}). ` +
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

    private isRateLimitError(error: unknown): boolean {
        if (error instanceof Error) {
            return error.message.includes("429") || error.message.includes("rate limit");
        }
        if (typeof error === "object" && error !== null && "status" in error) {
            return (error as { status: number }).status === 429;
        }
        return false;
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

// ─── Pre-configured queues per provider ─────────────────

/** Pricempire: 30K/month ≈ 1K/day, conservative 1 req/s */
export const pricempireQueue = new ApiRequestQueue({
    minDelayMs: 1000,
    maxRetries: 3,
    maxDailyRequests: 1000,
});

/** CSFloat: no published limits, conservative 1 req/2s */
export const csfloatQueue = new ApiRequestQueue({
    minDelayMs: 2000,
    maxRetries: 2,
    maxDailyRequests: 5000,
});

/** Steam Market: ~20 req/min, 1 req/3s to be safe */
export const steamQueue = new ApiRequestQueue({
    minDelayMs: 3000,
    maxRetries: 3,
    maxDailyRequests: 500,
});

/** CSGOTrader: bulk JSON fetch, conservative 1 req/5s */
export const csgotraderQueue = new ApiRequestQueue({
    minDelayMs: 5000,
    maxRetries: 3,
    maxDailyRequests: 1000,
});
