import { prisma } from "@/lib/db";
import { classifyCatalogEntry } from "@/lib/market/intelligence/catalog";
import {
    claimQueueItem,
    findDueQueueItems,
    getQueueSummary,
    promoteDueActiveSignalQueueItems,
    recoverStaleLocks,
    releaseQueueItemRetry,
    releaseQueueItemSuccess,
    rescheduleMsForQueueItem,
    suspendHighSupplyBacklog,
    type IntelligenceQueueItemWithMarketHash,
    type QueueSummary,
} from "@/lib/market/intelligence/queue";
import { processIntelligenceResult } from "@/lib/market/intelligence/processor";
import {
    fetchCsfloatPriceList,
    fetchCsfloatPriceListEntry,
    fetchScmPriceOverview,
    type CsfloatPriceListEntry,
    type CsfloatPriceListNormalizedPayload,
    type IntelligenceProviderResult,
    type ScmNormalizedPayload,
} from "@/lib/market/intelligence/providers";
import { buildScmBudgetSummary, hasScmBudget, normalizeScmBudget, SCM_CRON_PER_RUN_CAP, type ScmBudgetState, type ScmBudgetSummary } from "@/lib/market/intelligence/budget";

export interface IntelligenceRunnerOptions {
    now?: Date;
    perRunCap?: number;
    budgetMs?: number;
    minRemainingMsToStartJob?: number;
    startedAtMs?: number;
    provider?: IntelligenceProvider;
    csfloatProvider?: CsfloatProvider;
    csfloatScoutProvider?: CsfloatScoutProvider;
    itemIds?: string[];
}

export interface IntelligenceLaneResult {
    candidates: number;
    claimed: number;
    processed: number;
    succeeded: number;
    failed: number;
    skippedDueToBudget: number;
    itemIds: string[];
}

export interface IntelligenceLaneResults {
    scmHot: IntelligenceLaneResult;
    scmDiscovery: IntelligenceLaneResult;
    csfloatScout: { candidates: number; processed: number; failed: number; itemIds: string[] };
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
    autoPromoted: number;
    autoPromotedItemIds: string[];
    stalePromotionCount: number;
    stalePromotedItemIds: string[];
    scmValidatedCount: number;
    csfloatCandidateCount: number;
    lanes: IntelligenceLaneResults;
    scmBudget: ScmBudgetSummary;
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

type IntelligenceProvider = (
    marketHashName: string,
    options?: { now?: Date; skipCache?: boolean; timeoutMs?: number }
) => Promise<IntelligenceProviderResult<ScmNormalizedPayload>>;

type CsfloatProvider = (
    marketHashName: string,
    options?: { now?: Date; skipCache?: boolean; timeoutMs?: number }
) => Promise<IntelligenceProviderResult<CsfloatPriceListEntry>>;

type CsfloatScoutProvider = (
    options?: { now?: Date; skipCache?: boolean; timeoutMs?: number }
) => Promise<IntelligenceProviderResult<CsfloatPriceListNormalizedPayload>>;

const DEFAULT_PER_RUN_CAP = SCM_CRON_PER_RUN_CAP;
const MAX_PER_RUN_CAP = SCM_CRON_PER_RUN_CAP;
const DEFAULT_BUDGET_MS = 28_000;
const DEFAULT_MIN_REMAINING_MS_TO_START_JOB = 12_000;
const SCM_QUEUE_DELAY_RESERVE_MS = 10_000;
const SCM_PROVIDER_MAX_TIMEOUT_MS = 15_000;
const CSFLOAT_PROVIDER_MAX_TIMEOUT_MS = 15_000;
const CSFLOAT_SCOUT_MAX_TIMEOUT_MS = 5_000;
const CSFLOAT_MIN_FETCH_RESERVE_MS = 500;
const PROCESSING_RESPONSE_RESERVE_MS = 1_000;
const MIN_USEFUL_PROVIDER_TIMEOUT_MS = 250;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_MS = 30 * 60 * 1000;

const CIRCUIT_BREAKER_REASONS = new Set(["HTTP_429", "HTTP_403", "HTTP_5XX", "TIMEOUT", "MALFORMED_JSON", "MALFORMED_PAYLOAD", "PROVIDER_UNSUCCESSFUL"]);

async function enqueueCsfloatScoutCandidates(entries: CsfloatPriceListEntry[], now: Date): Promise<string[]> {
    const enqueuedMarketHashNames: string[] = [];

    for (const entry of entries) {
        const marketHashName = entry.marketHashName.trim();
        const classification = classifyCatalogEntry({
            marketHashName,
            quantity: entry.quantity,
            minPriceCents: entry.minPriceCents,
        });

        if (classification.disabledReason) continue;

        const item = await prisma.item.upsert({
            where: { marketHashName },
            create: {
                marketHashName,
                name: marketHashName,
                category: classification.category,
                type: classification.type,
                isWatched: false,
                isActive: true,
            },
            update: {},
        });

        await prisma.intelligenceQueueItem.upsert({
            where: { itemId: item.id },
            create: {
                itemId: item.id,
                nextRunAt: now,
                priority: classification.priority,
                tier: classification.tier,
                attempts: 0,
                lastError: null,
                lockedUntil: null,
                lastFetchedAt: null,
                disabledReason: null,
                status: "pending",
            },
            update: {
                priority: classification.priority,
                tier: classification.tier,
                disabledReason: null,
                lastError: null,
            },
        });

        await prisma.intelligenceQueueItem.updateMany({
            where: {
                itemId: item.id,
                status: { in: ["pending", "disabled"] },
                OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            },
            data: {
                nextRunAt: now,
                priority: classification.priority,
                tier: classification.tier,
                attempts: 0,
                lastError: null,
                lockedUntil: null,
                disabledReason: null,
                status: "pending",
            },
        });

        enqueuedMarketHashNames.push(marketHashName);
    }

    return enqueuedMarketHashNames;
}

async function incrementBudget(config: IntelligenceConfigState, now: Date): Promise<void> {
    const budget = normalizeScmBudget(config.requestBudget, now);
    const nextBudget: ScmBudgetState = {
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

function emptyLaneResult(): IntelligenceLaneResult {
    return { candidates: 0, claimed: 0, processed: 0, succeeded: 0, failed: 0, skippedDueToBudget: 0, itemIds: [] };
}

function emptyLaneResults(): IntelligenceLaneResults {
    return {
        scmHot: emptyLaneResult(),
        scmDiscovery: emptyLaneResult(),
        csfloatScout: { candidates: 0, processed: 0, failed: 0, itemIds: [] },
    };
}

function skipped(
    reason: string,
    timing: { startedAtMs: number; budgetMs: number; requestedLimit: number; effectiveLimit: number; scmBudget?: ScmBudgetSummary }
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
        autoPromoted: 0,
        autoPromotedItemIds: [],
        stalePromotionCount: 0,
        stalePromotedItemIds: [],
        scmValidatedCount: 0,
        csfloatCandidateCount: 0,
        lanes: emptyLaneResults(),
        scmBudget: timing.scmBudget ?? buildScmBudgetSummary({}, new Date()),
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
    let currentScmBudget = buildScmBudgetSummary({}, now);
    const timing = { startedAtMs, budgetMs, requestedLimit, effectiveLimit: perRunCap, scmBudget: currentScmBudget };
    const provider = options.provider ?? fetchScmPriceOverview;
    const csfloatProvider = options.csfloatProvider ?? fetchCsfloatPriceListEntry;
    const csfloatScoutProvider = options.csfloatScoutProvider ?? fetchCsfloatPriceList;

    let config: IntelligenceConfigState | null;
    try {
        config = await readConfig();
    } catch (error) {
        console.error("[IntelligenceRunner] Failed to read config", error instanceof Error ? error.message : error);
        return skipped("config_unavailable", timing);
    }

    if (!config) return skipped("config_unavailable", timing);
    currentScmBudget = buildScmBudgetSummary(config.requestBudget, now);
    timing.scmBudget = currentScmBudget;
    if (!config.liveScmEnabled) return skipped("live_scm_disabled", timing);
    if (config.circuitBreakerUntil && config.circuitBreakerUntil.getTime() > now.getTime()) return skipped("circuit_breaker_open", timing);
    if (perRunCap === 0) return skipped("per_run_cap_zero", timing);

    const staleLocksRecovered = await recoverStaleLocks(now);
    const backlogSuspended = await suspendHighSupplyBacklog(now);
    const autoPromotion = options.itemIds === undefined
        ? await promoteDueActiveSignalQueueItems({ now, limit: perRunCap })
        : { promoted: 0, itemIds: [] };
    const dueItems = await findDueQueueItems({ now, limit: perRunCap, itemIds: options.itemIds });
    const autoPromotedItemIdSet = new Set(autoPromotion.itemIds);
    const lanes = emptyLaneResults();
    const hotDueItems = dueItems.filter((item) => autoPromotedItemIdSet.has(item.itemId));
    const discoveryDueItems = dueItems.filter((item) => !autoPromotedItemIdSet.has(item.itemId));
    lanes.scmHot.candidates = hotDueItems.length;
    lanes.scmHot.itemIds = hotDueItems.map((item) => item.itemId);
    lanes.scmDiscovery.candidates = discoveryDueItems.length;
    lanes.scmDiscovery.itemIds = discoveryDueItems.map((item) => item.itemId);

    const scoutRemainingMs = timingFields(startedAtMs, budgetMs).remainingMs;
    if (scoutRemainingMs > minRemainingMsToStartJob + CSFLOAT_MIN_FETCH_RESERVE_MS) {
        const scoutTimeoutMs = boundedProviderTimeoutMs(scoutRemainingMs, PROCESSING_RESPONSE_RESERVE_MS, CSFLOAT_SCOUT_MAX_TIMEOUT_MS);
        lanes.csfloatScout.processed = 1;
        try {
            const scoutResult = await csfloatScoutProvider({ now, timeoutMs: scoutTimeoutMs });
            if (scoutResult.ok && scoutResult.normalized) {
                const candidates = scoutResult.normalized.entries
                    .filter((entry) => entry.quantity > 0 && entry.quantity <= 10 && entry.minPriceCents > 0)
                    .slice(0, perRunCap);
                const enqueuedMarketHashNames = await enqueueCsfloatScoutCandidates(candidates, now);
                lanes.csfloatScout.candidates = candidates.length;
                lanes.csfloatScout.itemIds = enqueuedMarketHashNames;
            } else {
                lanes.csfloatScout.failed = 1;
            }
        } catch (error) {
            console.error("[IntelligenceRunner] CSFloat scout lane failed", error instanceof Error ? error.message : error);
            lanes.csfloatScout.failed = 1;
        }
    }

    let claimed = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedDueToBudget = 0;
    let scmValidatedCount = 0;
    let circuitBreakerOpened = false;
    let timeBudgetExceeded = false;

    for (const [index, dueItem] of dueItems.entries()) {
        const remainingMs = timingFields(startedAtMs, budgetMs).remainingMs;
        if (remainingMs <= minRemainingMsToStartJob) {
            timeBudgetExceeded = true;
            break;
        }

        if (!hasScmBudget(config.requestBudget, now)) {
            skippedDueToBudget = dueItems.length - index;
            const budgetLane = autoPromotedItemIdSet.has(dueItem.itemId) ? lanes.scmHot : lanes.scmDiscovery;
            budgetLane.skippedDueToBudget = skippedDueToBudget;
            break;
        }

        const lane = autoPromotedItemIdSet.has(dueItem.itemId) ? lanes.scmHot : lanes.scmDiscovery;
        const claimedItem = await claimQueueItem(dueItem, { now });
        if (!claimedItem) continue;

        claimed++;
        lane.claimed++;
        await incrementBudget(config, now);
        currentScmBudget = buildScmBudgetSummary(config.requestBudget, now);

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
            lane.processed++;
            countedProcessed = true;

            if (providerResult.ok) {
                scmValidatedCount++;
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
                    lane.failed++;
                    await releaseQueueItemRetry(claimedItem.id, claimedItem.attempts, processingResult.reason ?? "Intelligence processing failed", now);
                    continue;
                }

                succeeded++;
                lane.succeeded++;
                await releaseQueueItemSuccess(claimedItem.id, now, rescheduleMsForQueueItem(claimedItem, processingResult.scoring));
                await markProviderSuccess(config, now);
                continue;
            }

            failed++;
            lane.failed++;
            const message = failureMessage(claimedItem, providerResult);
            await releaseQueueItemRetry(claimedItem.id, claimedItem.attempts, message, now);
            const opened = await markProviderFailure(config, message, shouldCountTowardCircuit(providerResult), now);
            circuitBreakerOpened = circuitBreakerOpened || opened;
            if (opened) break;
        } catch (error) {
            failed++;
            lane.failed++;
            if (!countedProcessed) {
                processed++;
                lane.processed++;
            }
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
        autoPromoted: autoPromotion.promoted,
        autoPromotedItemIds: autoPromotion.itemIds,
        stalePromotionCount: autoPromotion.promoted,
        stalePromotedItemIds: autoPromotion.itemIds,
        scmValidatedCount,
        csfloatCandidateCount: lanes.csfloatScout.candidates,
        lanes,
        scmBudget: currentScmBudget,
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
