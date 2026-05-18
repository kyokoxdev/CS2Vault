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
    provider?: IntelligenceProvider;
    csfloatProvider?: CsfloatProvider;
}

export interface IntelligenceRunnerResult {
    status: "success" | "skipped" | "partial" | "failed";
    reason?: string;
    claimed: number;
    processed: number;
    succeeded: number;
    failed: number;
    skippedDueToBudget: number;
    staleLocksRecovered: number;
    backlogSuspended: number;
    circuitBreakerOpened: boolean;
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
    options?: { now?: Date; skipCache?: boolean }
) => Promise<IntelligenceProviderResult<ScmNormalizedPayload>>;

type CsfloatProvider = (
    marketHashName: string,
    options?: { now?: Date; skipCache?: boolean }
) => Promise<IntelligenceProviderResult<CsfloatPriceListEntry>>;

const DEFAULT_PER_RUN_CAP = 10;
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

function skipped(reason: string): IntelligenceRunnerResult {
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
    };
}

export async function runIntelligenceQueue(options: IntelligenceRunnerOptions = {}): Promise<IntelligenceRunnerResult> {
    const now = options.now ?? new Date();
    const perRunCap = Math.max(0, options.perRunCap ?? DEFAULT_PER_RUN_CAP);
    const provider = options.provider ?? fetchScmPriceOverview;
    const csfloatProvider = options.csfloatProvider ?? fetchCsfloatPriceListEntry;

    let config: IntelligenceConfigState | null;
    try {
        config = await readConfig();
    } catch (error) {
        console.error("[IntelligenceRunner] Failed to read config", error instanceof Error ? error.message : error);
        return skipped("config_unavailable");
    }

    if (!config) return skipped("config_unavailable");
    if (!config.liveScmEnabled) return skipped("live_scm_disabled");
    if (config.circuitBreakerUntil && config.circuitBreakerUntil.getTime() > now.getTime()) return skipped("circuit_breaker_open");
    if (perRunCap === 0) return skipped("per_run_cap_zero");

    const staleLocksRecovered = await recoverStaleLocks(now);
    const backlogSuspended = await suspendHighSupplyBacklog(now);
    const dueItems = await findDueQueueItems({ now, limit: perRunCap });

    let claimed = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedDueToBudget = 0;
    let circuitBreakerOpened = false;

    for (const [index, dueItem] of dueItems.entries()) {
        if (!hasBudget(config, now)) {
            skippedDueToBudget = dueItems.length - index;
            break;
        }

        const claimedItem = await claimQueueItem(dueItem, { now });
        if (!claimedItem) continue;

        claimed++;
        await incrementBudget(config, now);

        const providerResult = await provider(claimedItem.item.marketHashName, { now, skipCache: true });
        processed++;

        if (providerResult.ok) {
            const csfloatResult = await csfloatProvider(claimedItem.item.marketHashName, { now });
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
    }

    const summary = await getQueueSummary(now);
    return {
        status: failed > 0 ? (succeeded > 0 ? "partial" : "failed") : "success",
        claimed,
        processed,
        succeeded,
        failed,
        skippedDueToBudget,
        staleLocksRecovered,
        backlogSuspended,
        circuitBreakerOpened,
        summary,
    };
}
