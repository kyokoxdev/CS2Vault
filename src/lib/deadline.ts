export const REQUEST_DEADLINE_MESSAGE = "Request deadline exceeded";

interface DeadlineOptions {
    deadlineAtMs?: number;
    minRemainingMs?: number;
}

export function getRemainingDeadlineMs(options?: DeadlineOptions): number | null {
    if (options?.deadlineAtMs === undefined) return null;
    return options.deadlineAtMs - Date.now() - (options.minRemainingMs ?? 0);
}

export function createDeadlineSignal(options: DeadlineOptions | undefined, defaultTimeoutMs: number): AbortSignal {
    const remainingMs = getRemainingDeadlineMs(options);
    if (remainingMs !== null && remainingMs <= 0) {
        throw new Error(REQUEST_DEADLINE_MESSAGE);
    }

    const timeoutMs = remainingMs === null
        ? defaultTimeoutMs
        : Math.max(1, Math.min(defaultTimeoutMs, remainingMs));
    return AbortSignal.timeout(timeoutMs);
}
