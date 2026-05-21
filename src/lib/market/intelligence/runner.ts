import { prisma } from "@/lib/db";
import {
    claimQueueItem,
    findDueQueueItems,
    getQueueSummary,
    recoverStaleLocks,
    releaseQueueItemRetry,
    releaseQueueItemSuccess,
    suspendHighSupplyBacklog,
    type IntelligenceQueueItemWithMarketHash,
    type QueueSummary,
} from "@/lib/market/intelligence/queue";
import { processIntelligenceResult } from "@/lib/market/intelligence/processor";
import {
    fetchCsfloatPriceListEntry,
    fetchScmPriceOverview,
    type CsfloatPriceListEntry,
    type IntelligenceProviderResult,
    type ScmNormalizedPayload,
} from "@/lib/market/intelligence/providers";

export interface IntelligenceRunnerOptions {
    now?: Date;
    perRunCap?: number;
    budgetMs?: number;
    minRemainingMsToStartJob?: number;
    startedAtMs?: number;
    provider?: IntelligenceProvider;
    csfloatProvider?: CsfloatProvider;
    itemIds?: string[];
}

export interface IntelligenceRunnerResult {
    status: "success" | "skipped" | "partial" | "failed" | "time_budget_exhausted";
    reason?: string;
    claimed: number;
    processed: number;
    succeeded: number;
    failed: number;
    skippedDueToBudget: number;
    staleLocksRecovered: number;
    backlogSuspended: number;
    circuitBreakerOpened: boolean;
    timeBudgetExceeded: boolean;
    budgetMs: number;
    elapsedMs: number;
    remainingMs: number;
    requestedLimit: number;
    effectiveLimit: number;
    summary?: QueueSummary;
}

interface IntelligenceConfigState {
    id: string;
    liveScmEnabled: boolean;
    circuitBreakerUntil: Date | null;
    consecutiveProviderFailures: number;
    requestBudget: unknown;
}

interface RequestBudgetState {
    [key: string]: string | number;
    scmMinuteStartedAt: string;
    scmMinuteCount: number;
    scmDayStartedAt: string;
    scmDayCount: number;
}

type IntelligenceProvider = (
    marketHashName: string,
    options?: { now?: Date; skipCache?: boolean; timeoutMs?: number }
) => Promise<IntelligenceProviderResult<ScmNormalizedPayload>>;

type CsfloatProvider = (
    marketHashName: string,
    options?: { now?: Date; skipCache?: boolean; timeoutMs?: number }
) => Promise<IntelligenceProviderResult<CsfloatPriceListEntry>>;

const DEFAULT_PER_RUN_CAP = 10;
const MAX_PER_RUN_CAP = 10;
const DEFAULT_BUDGET_MS = 28_000;
const DEFAULT_MIN_REMAINING_MS_TO_START_JOB = 12_000;
const SCM_QUEUE_DELAY_RESERVE_MS = 10_000;
const SCM_PROVIDER_MAX_TIMEOUT_MS = 15_000;
const CSFLOAT_PROVIDER_MAX_TIMEOUT_MS = 15_000;
const CSFLOAT_MIN_FETCH_RESERVE_MS = 500;
const PROCESSING_RESPONSE_RESERVE_MS = 1_000;
const MIN_USEFUL_PROVIDER_TIMEOUT_MS = 250;
const SCM_MAX_PER_MINUTE = 19;
const SCM_MAX_PER_DAY = 950;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_MS = 30 * 60 * 1000;

const CIRCUIT_BREAKER_REASONS = new Set(["HTTP_429", "HTTP_403", "HTTP_5XX", "TIMEOUT", "MALFORMED_JSON", "MALFORMED_PAYLOAD", "PROVIDER_UNSUCCESSFUL"]);

function defaultBudget(now: Date): RequestBudgetState {
    return {
        scmMinuteStartedAt: now.toISOString(),
        scmMinuteCount: 0,
        scmDayStartedAt: now.toISOString(),
        scmDayCount: 0,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function normalizeBudget(value: unknown, now: Date): RequestBudgetState {
    if (!isRecord(value)) return defaultBudget(now);

    const fallback = defaultBudget(now);
    const minuteStartedAt = stringValue(value.scmMinuteStartedAt) ?? fallback.scmMinuteStartedAt;
    const dayStartedAt = stringValue(value.scmDayStartedAt) ?? fallback.scmDayStartedAt;
    const minuteStart = new Date(minuteStartedAt);
    const dayStart = new Date(dayStartedAt);
    const minuteFresh = Number.isFinite(minuteStart.getTime()) && now.getTime() - minuteStart.getTime() < 60_000;
    const dayFresh = Number.isFinite(dayStart.getTime()) && now.toISOString().slice(0, 10) === dayStart.toISOString().slice(0, 10);

    return {
        scmMinuteStartedAt: minuteFresh ? minuteStartedAt : now.toISOString(),
        scmMinuteCount: minuteFresh ? numberValue(value.scmMinuteCount) ?? 0 : 0,
        scmDayStartedAt: dayFresh ? dayStartedAt : now.toISOString(),
        scmDayCount: dayFresh ? numberValue(value.scmDayCount) ?? 0 : 0,
    };
}

function hasBudget(config: IntelligenceConfigState, now: Date): boolean {
    const budget = normalizeBudget(config.requestBudget, now);
    return budget.scmMinuteCount < SCM_MAX_PER_MINUTE && budget.scmDayCount < SCM_MAX_PER_DAY;
}

async function incrementBudget(config: IntelligenceConfigState, now: Date): Promise<void> {
    const budget = normalizeBudget(config.requestBudget, now);
    const nextBudget: RequestBudgetState = {
        ...budget,
        scmMinuteCount: budget.scmMinuteCount + 1,
        scmDayCount: budget.scmDayCount + 1,
    };

    config.requestBudget = nextBudget;
    await prisma.intelligenceConfig.update({
        where: { id: config.id },
        data: { requestBudget: nextBudget, lastRunAt: now, lastError: null },
    });
}

async function markProviderSuccess(config: IntelligenceConfigState, now: Date): Promise<void> {
    config.consecutiveProviderFailures = 0;
    await prisma.intelligenceConfig.update({
        where: { id: config.id },
        data: { consecutiveProviderFailures: 0, lastError: null, lastRunAt: now },
    });
}

async function markProviderFailure(config: IntelligenceConfigState, message: string, opensCircuit: boolean, now: Date): Promise<boolean> {
    const nextFailures = config.consecutiveProviderFailures + 1;
    config.consecutiveProviderFailures = nextFailures;
    const shouldOpenCircuit = opensCircuit && nextFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    const circuitBreakerUntil = shouldOpenCircuit ? new Date(now.getTime() + CIRCUIT_BREAKER_MS) : config.circuitBreakerUntil;
    config.circuitBreakerUntil = circuitBreakerUntil;

    await prisma.intelligenceConfig.update({
        where: { id: config.id },
        data: {
            consecutiveProviderFailures: nextFailures,
            circuitBreakerUntil,
            lastError: message,
            lastRunAt: now,
        },
    });

    return shouldOpenCircuit;
}

async function readConfig(): Promise<IntelligenceConfigState | null> {
    return prisma.intelligenceConfig.findUnique({
        where: { id: "default" },
        select: {
            id: true,
            liveScmEnabled: true,
            circuitBreakerUntil: true,
            consecutiveProviderFailures: true,
            requestBudget: true,
        },
    }) as Promise<IntelligenceConfigState | null>;
}

function failureMessage(item: IntelligenceQueueItemWithMarketHash, result: IntelligenceProviderResult<ScmNormalizedPayload>): string {
    return result.failure?.message ?? `Provider failed for ${item.item.marketHashName}`;
}

function shouldCountTowardCircuit(result: IntelligenceProviderResult<ScmNormalizedPayload>): boolean {
    return result.failure ? CIRCUIT_BREAKER_REASONS.has(result.failure.reason) : false;
}

function clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.floor(value), min), max);
}

function timingFields(startedAtMs: number, budgetMs: number) {
    const elapsedMs = Math.max(0, Date.now() - startedAtMs);
    const remainingMs = Math.max(0, budgetMs - elapsedMs);

    return { elapsedMs, remainingMs };
}

function boundedProviderTimeoutMs(remainingMs: number, reserveMs: number, maxTimeoutMs: number): number {
    const usefulTimeoutMs = Math.max(MIN_USEFUL_PROVIDER_TIMEOUT_MS, Math.floor(remainingMs - reserveMs));
    return Math.min(usefulTimeoutMs, maxTimeoutMs);
}

function skipped(
    reason: string,
    timing: { startedAtMs: number; budgetMs: number; requestedLimit: number; effectiveLimit: number }
): IntelligenceRunnerResult {
    const { elapsedMs, remainingMs } = timingFields(timing.startedAtMs, timing.budgetMs);
    return {
        status: "skipped",
        reason,
        claimed: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skippedDueToBudget: 0,
        staleLocksRecovered: 0,
        backlogSuspended: 0,
        circuitBreakerOpened: false,
        timeBudgetExceeded: false,
        budgetMs: timing.budgetMs,
        elapsedMs,
        remainingMs,
        requestedLimit: timing.requestedLimit,
        effectiveLimit: timing.effectiveLimit,
    };
}

export async function runIntelligenceQueue(options: IntelligenceRunnerOptions = {}): Promise<IntelligenceRunnerResult> {
    const now = options.now ?? new Date();
    const requestedLimit = Math.max(0, Math.floor(options.perRunCap ?? DEFAULT_PER_RUN_CAP));
    const perRunCap = requestedLimit === 0 ? 0 : clampInteger(requestedLimit, 1, MAX_PER_RUN_CAP);
    const budgetMs = Math.max(1, Math.floor(options.budgetMs ?? DEFAULT_BUDGET_MS));
    const minRemainingMsToStartJob = Math.max(0, Math.floor(options.minRemainingMsToStartJob ?? DEFAULT_MIN_REMAINING_MS_TO_START_JOB));
    const startedAtMs = options.startedAtMs ?? Date.now();
    const timing = { startedAtMs, budgetMs, requestedLimit, effectiveLimit: perRunCap };
    const provider = options.provider ?? fetchScmPriceOverview;
    const csfloatProvider = options.csfloatProvider ?? fetchCsfloatPriceListEntry;

    let config: IntelligenceConfigState | null;
    try {
        config = await readConfig();
    } catch (error) {
        console.error("[IntelligenceRunner] Failed to read config", error instanceof Error ? error.message : error);
        return skipped("config_unavailable", timing);
    }

    if (!config) return skipped("config_unavailable", timing);
    if (!config.liveScmEnabled) return skipped("live_scm_disabled", timing);
    if (config.circuitBreakerUntil && config.circuitBreakerUntil.getTime() > now.getTime()) return skipped("circuit_breaker_open", timing);
    if (perRunCap === 0) return skipped("per_run_cap_zero", timing);

    const staleLocksRecovered = await recoverStaleLocks(now);
    const backlogSuspended = await suspendHighSupplyBacklog(now);
    const dueItems = await findDueQueueItems({ now, limit: perRunCap, itemIds: options.itemIds });

    let claimed = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedDueToBudget = 0;
    let circuitBreakerOpened = false;
    let timeBudgetExceeded = false;

    for (const [index, dueItem] of dueItems.entries()) {
        const remainingMs = timingFields(startedAtMs, budgetMs).remainingMs;
        if (remainingMs <= minRemainingMsToStartJob) {
            timeBudgetExceeded = true;
            break;
        }

        if (!hasBudget(config, now)) {
            skippedDueToBudget = dueItems.length - index;
            break;
        }

        const claimedItem = await claimQueueItem(dueItem, { now });
        if (!claimedItem) continue;

        claimed++;
        await incrementBudget(config, now);

        let countedProcessed = false;
        try {
            const scmRemainingMs = timingFields(startedAtMs, budgetMs).remainingMs;
            const scmTimeoutMs = boundedProviderTimeoutMs(
                scmRemainingMs,
                SCM_QUEUE_DELAY_RESERVE_MS + CSFLOAT_MIN_FETCH_RESERVE_MS + PROCESSING_RESPONSE_RESERVE_MS,
                SCM_PROVIDER_MAX_TIMEOUT_MS
            );
            const providerResult = await provider(claimedItem.item.marketHashName, { now, skipCache: true, timeoutMs: scmTimeoutMs });
            processed++;
            countedProcessed = true;

            if (providerResult.ok) {
                const csfloatRemainingMs = timingFields(startedAtMs, budgetMs).remainingMs;
                const csfloatTimeoutMs = boundedProviderTimeoutMs(csfloatRemainingMs, PROCESSING_RESPONSE_RESERVE_MS, CSFLOAT_PROVIDER_MAX_TIMEOUT_MS);
                const csfloatResult = await csfloatProvider(claimedItem.item.marketHashName, { now, timeoutMs: csfloatTimeoutMs });
                const processingResult = await processIntelligenceResult({
                    itemId: claimedItem.itemId,
                    marketHashName: claimedItem.item.marketHashName,
                    providerResult,
                    csfloatResult,
                    now,
                });

                if (processingResult.status !== "success") {
                    failed++;
                    await releaseQueueItemRetry(claimedItem.id, claimedItem.attempts, processingResult.reason ?? "Intelligence processing failed", now);
                    continue;
                }

                succeeded++;
                await releaseQueueItemSuccess(claimedItem.id, now);
                await markProviderSuccess(config, now);
                continue;
            }

            failed++;
            const message = failureMessage(claimedItem, providerResult);
            await releaseQueueItemRetry(claimedItem.id, claimedItem.attempts, message, now);
            const opened = await markProviderFailure(config, message, shouldCountTowardCircuit(providerResult), now);
            circuitBreakerOpened = circuitBreakerOpened || opened;
            if (opened) break;
        } catch (error) {
            failed++;
            if (!countedProcessed) processed++;
            const message = error instanceof Error ? error.message : "Intelligence queue item failed";
            await releaseQueueItemRetry(claimedItem.id, claimedItem.attempts, message, now);
        }
    }

    const summary = await getQueueSummary(now);
    const { elapsedMs, remainingMs } = timingFields(startedAtMs, budgetMs);
    return {
        status: timeBudgetExceeded ? "time_budget_exhausted" : failed > 0 ? (succeeded > 0 ? "partial" : "failed") : "success",
        reason: timeBudgetExceeded ? "time_budget_exhausted" : undefined,
        claimed,
        processed,
        succeeded,
        failed,
        skippedDueToBudget,
        staleLocksRecovered,
        backlogSuspended,
        circuitBreakerOpened,
        timeBudgetExceeded,
        budgetMs,
        elapsedMs,
        remainingMs,
        requestedLimit,
        effectiveLimit: perRunCap,
        summary,
    };
}
