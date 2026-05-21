import { prisma } from "@/lib/db";

export type IntelligenceQueueStatus = "pending" | "running" | "backoff" | "disabled";

export interface IntelligenceQueueItemWithMarketHash {
    id: string;
    itemId: string;
    nextRunAt: Date;
    priority: number;
    tier: string;
    attempts: number;
    lastError: string | null;
    lockedUntil: Date | null;
    lastFetchedAt: Date | null;
    disabledReason: string | null;
    status: string;
    item: { marketHashName: string };
}

export interface DueQueueOptions {
    now?: Date;
    limit: number;
    itemIds?: string[];
}

export interface ClaimQueueOptions {
    now?: Date;
    lockMs?: number;
}

export interface QueueSummary {
    pending: number;
    running: number;
    backoff: number;
    disabled: number;
    oldestDueAt: Date | null;
    oldestDueAgeMs: number | null;
}

export interface PromoteStaleSignalQueueItemsOptions {
    now?: Date;
    limit?: number;
}

export interface PromoteStaleSignalQueueItemsResult {
    candidateSignals: number;
    candidateQueueItems: number;
    promoted: number;
    itemIds: string[];
}

const DEFAULT_LOCK_MS = 5 * 60 * 1000;
const SUCCESS_RESCHEDULE_MS = 6 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
const BASE_BACKOFF_MS = 5 * 60 * 1000;
const BACKLOG_SUSPEND_MS = 24 * 60 * 60 * 1000;
const SUSPENDED_TIERS = ["high-supply", "liquid"];
const SIGNAL_STALE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PROMOTION_LIMIT = 10;
const MAX_PROMOTION_LIMIT = 10;

function queueSelect() {
    return {
        id: true,
        itemId: true,
        nextRunAt: true,
        priority: true,
        tier: true,
        attempts: true,
        lastError: true,
        lockedUntil: true,
        lastFetchedAt: true,
        disabledReason: true,
        status: true,
        item: { select: { marketHashName: true } },
    };
}

export function calculateBackoffMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

export async function findDueQueueItems(options: DueQueueOptions): Promise<IntelligenceQueueItemWithMarketHash[]> {
    const now = options.now ?? new Date();
    const statusFilter: IntelligenceQueueStatus[] = ["pending", "backoff"];

    return prisma.intelligenceQueueItem.findMany({
        where: {
            status: { in: statusFilter },
            nextRunAt: { lte: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            ...(options.itemIds !== undefined ? { itemId: { in: options.itemIds } } : {}),
        },
        select: queueSelect(),
        orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
        take: options.limit,
    }) as Promise<IntelligenceQueueItemWithMarketHash[]>;
}

export async function claimQueueItem(
    item: Pick<IntelligenceQueueItemWithMarketHash, "id" | "nextRunAt" | "lockedUntil">,
    options: ClaimQueueOptions = {}
): Promise<IntelligenceQueueItemWithMarketHash | null> {
    const now = options.now ?? new Date();
    const lockMs = options.lockMs ?? DEFAULT_LOCK_MS;
    const lockedUntil = new Date(now.getTime() + lockMs);

    const { count } = await prisma.intelligenceQueueItem.updateMany({
        where: {
            id: item.id,
            status: { in: ["pending", "backoff"] },
            nextRunAt: { lte: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        data: {
            status: "running",
            lockedUntil,
            disabledReason: null,
        },
    });

    if (count !== 1) return null;

    return prisma.intelligenceQueueItem.findUnique({
        where: { id: item.id },
        select: queueSelect(),
    }) as Promise<IntelligenceQueueItemWithMarketHash | null>;
}

export async function recoverStaleLocks(now: Date = new Date()): Promise<number> {
    const { count } = await prisma.intelligenceQueueItem.updateMany({
        where: {
            status: "running",
            lockedUntil: { lt: now },
        },
        data: {
            status: "pending",
            lockedUntil: null,
            lastError: "Recovered stale intelligence queue lock",
        },
    });

    return count;
}

export async function promoteStaleSignalQueueItems(options: PromoteStaleSignalQueueItemsOptions = {}): Promise<PromoteStaleSignalQueueItemsResult> {
    const now = options.now ?? new Date();
    const requestedLimit = Math.floor(options.limit ?? DEFAULT_PROMOTION_LIMIT);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PROMOTION_LIMIT, 1), MAX_PROMOTION_LIMIT);
    const staleCutoff = new Date(now.getTime() - SIGNAL_STALE_MS);

    const candidateSignals = await prisma.intelligenceSignal.count({
        where: {
            status: "active",
            lastSeenAt: { lt: staleCutoff },
        },
    });
    if (candidateSignals === 0) {
        return { candidateSignals: 0, candidateQueueItems: 0, promoted: 0, itemIds: [] };
    }

    const queueItems = await prisma.intelligenceQueueItem.findMany({
        where: {
            status: "pending",
            nextRunAt: { gt: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            item: {
                intelligenceSignals: {
                    some: {
                        status: "active",
                        lastSeenAt: { lt: staleCutoff },
                    },
                },
            },
        },
        select: { id: true, itemId: true },
        orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
        take: limit,
    });

    const queueItemIds = queueItems.map((item) => item.id);
    if (queueItemIds.length === 0) {
        return {
            candidateSignals,
            candidateQueueItems: 0,
            promoted: 0,
            itemIds: [],
        };
    }

    const { count } = await prisma.intelligenceQueueItem.updateMany({
        where: {
            id: { in: queueItemIds },
            status: "pending",
            nextRunAt: { gt: now },
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        data: {
            nextRunAt: now,
            lockedUntil: null,
        },
    });

    return {
        candidateSignals,
        candidateQueueItems: queueItems.length,
        promoted: count,
        itemIds: queueItems.map((item) => item.itemId),
    };
}

export async function releaseQueueItemSuccess(
    id: string,
    now: Date = new Date(),
    rescheduleMs: number = SUCCESS_RESCHEDULE_MS
): Promise<void> {
    await prisma.intelligenceQueueItem.update({
        where: { id },
        data: {
            status: "pending",
            attempts: 0,
            lastError: null,
            lockedUntil: null,
            lastFetchedAt: now,
            nextRunAt: new Date(now.getTime() + rescheduleMs),
            disabledReason: null,
        },
    });
}

export async function releaseQueueItemRetry(
    id: string,
    attempts: number,
    errorMessage: string,
    now: Date = new Date()
): Promise<Date> {
    const nextAttempts = attempts + 1;
    const nextRunAt = new Date(now.getTime() + calculateBackoffMs(nextAttempts));

    await prisma.intelligenceQueueItem.update({
        where: { id },
        data: {
            status: "backoff",
            attempts: nextAttempts,
            lastError: errorMessage,
            lockedUntil: null,
            nextRunAt,
        },
    });

    return nextRunAt;
}

export async function disableQueueItem(id: string, reason: string): Promise<void> {
    await prisma.intelligenceQueueItem.update({
        where: { id },
        data: {
            status: "disabled",
            lockedUntil: null,
            disabledReason: reason,
            lastError: reason,
        },
    });
}

export async function suspendHighSupplyBacklog(now: Date = new Date()): Promise<number> {
    const oldest = await prisma.intelligenceQueueItem.findFirst({
        where: {
            status: { in: ["pending", "backoff"] },
            nextRunAt: { lte: new Date(now.getTime() - BACKLOG_SUSPEND_MS) },
        },
        orderBy: { nextRunAt: "asc" },
        select: { nextRunAt: true },
    });

    if (!oldest) return 0;

    const { count } = await prisma.intelligenceQueueItem.updateMany({
        where: {
            tier: { in: SUSPENDED_TIERS },
            status: { in: ["pending", "backoff"] },
        },
        data: {
            status: "backoff",
            priority: -100,
            nextRunAt: new Date(now.getTime() + BACKLOG_SUSPEND_MS),
            lockedUntil: null,
            disabledReason: "suspended: backlog older than 24h; high-supply/liquid tier deferred",
            lastError: "High-supply backlog suspension active",
        },
    });

    return count;
}

export async function getQueueSummary(now: Date = new Date()): Promise<QueueSummary> {
    const [pending, running, backoff, disabled, oldestDue] = await Promise.all([
        prisma.intelligenceQueueItem.count({ where: { status: "pending" } }),
        prisma.intelligenceQueueItem.count({ where: { status: "running" } }),
        prisma.intelligenceQueueItem.count({ where: { status: "backoff" } }),
        prisma.intelligenceQueueItem.count({ where: { status: "disabled" } }),
        prisma.intelligenceQueueItem.findFirst({
            where: { status: { in: ["pending", "backoff"] }, nextRunAt: { lte: now } },
            orderBy: { nextRunAt: "asc" },
            select: { nextRunAt: true },
        }),
    ]);

    const oldestDueAt = oldestDue?.nextRunAt ?? null;
    return {
        pending,
        running,
        backoff,
        disabled,
        oldestDueAt,
        oldestDueAgeMs: oldestDueAt ? now.getTime() - oldestDueAt.getTime() : null,
    };
}
