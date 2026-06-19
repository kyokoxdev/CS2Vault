import { prisma } from "@/lib/db";
import { fetchCsfloatPriceList, type CsfloatPriceListEntry, type CsfloatPriceListNormalizedPayload, type IntelligenceProviderResult } from "@/lib/market/intelligence/providers";

const DEFAULT_CATALOG_CAP = 1_000;
const LOW_SUPPLY_MAX_QUANTITY = 100;
const LIQUID_MIN_QUANTITY = 500;
const CENTS_MIN_FLOOR = 1;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type CatalogQueueTier = "low_supply_discontinued" | "liquid" | "standard";
export type CatalogQueueStatus = "pending" | "disabled";
export type CatalogDisabledReason = "missing_floor" | "scm_not_tradable" | "invalid_catalog_entry";

export interface CatalogSeedEntry {
    marketHashName: string;
    quantity: number;
    minPriceCents: number | null;
}

export interface CatalogClassification {
    tier: CatalogQueueTier;
    priority: number;
    category: string;
    type: string | null;
    disabledReason: CatalogDisabledReason | null;
}

export interface CatalogSeedProgress {
    cursor: number;
    nextCursor: number | null;
    totalEntries: number;
    processedEntries: number;
    cap: number;
    hasMore: boolean;
}

export interface CatalogSeedResult {
    status: "success" | "failed";
    seeded: number;
    disabled: number;
    skipped: number;
    progress: CatalogSeedProgress;
    error?: string;
}

interface CatalogSeedOptions {
    now?: Date;
    random?: () => number;
    cursor?: number;
    cap?: number;
    fetchPriceList?: () => Promise<IntelligenceProviderResult<CsfloatPriceListNormalizedPayload>>;
    isScmTradable?: (entry: CatalogSeedEntry) => boolean;
}

function normalizedName(value: string): string {
    return value.trim().toLowerCase();
}

function isDiscontinuedLikeName(marketHashName: string): boolean {
    const name = normalizedName(marketHashName);
    return name.includes("case")
        || name.includes("capsule")
        || name.includes("sticker")
        || name.includes("souvenir package")
        || name.includes("collection package")
        || name.includes("operation")
        || name.includes("discontinued");
}

function inferCatalogCategory(marketHashName: string): string {
    const name = normalizedName(marketHashName);
    if (name.includes("sticker")) return "sticker";
    if (name.includes("case")) return "case";
    if (name.includes("capsule")) return "capsule";
    if (name.includes("souvenir package") || name.includes("collection package")) return "container";
    if (name.includes("agent")) return "agent";
    if (name.includes("music kit")) return "music-kit";
    if (name.includes("graffiti")) return "graffiti";
    return "weapon";
}

function inferCatalogType(category: string): string | null {
    if (["case", "capsule", "container"].includes(category)) return "container";
    if (category === "sticker") return "sticker";
    return null;
}

function priorityForTier(tier: CatalogQueueTier, entry: CatalogSeedEntry): number {
    if (tier === "low_supply_discontinued") return 100 + Math.max(0, LOW_SUPPLY_MAX_QUANTITY - Math.min(entry.quantity, LOW_SUPPLY_MAX_QUANTITY));
    if (tier === "liquid") return 50 + Math.min(49, Math.floor(entry.quantity / 1_000));
    return 10;
}

function relevanceRank(entry: CatalogSeedEntry): number {
    const classified = classifyCatalogEntry(entry);
    if (classified.tier === "low_supply_discontinued") return 0;
    if (classified.tier === "liquid") return 1;
    return 2;
}

function floorForSort(entry: CatalogSeedEntry): number {
    return entry.minPriceCents && Number.isFinite(entry.minPriceCents) ? entry.minPriceCents : 0;
}

function sanitizeRandom(random: () => number): number {
    const value = random();
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(0.999_999, value));
}

function randomWindowMs(minMs: number, maxMs: number, random: () => number): number {
    return minMs + Math.floor(sanitizeRandom(random) * (maxMs - minMs + 1));
}

function toCatalogEntry(entry: CsfloatPriceListEntry): CatalogSeedEntry {
    return {
        marketHashName: entry.marketHashName,
        quantity: entry.quantity,
        minPriceCents: entry.minPriceCents,
    };
}

export function classifyCatalogEntry(entry: CatalogSeedEntry): CatalogClassification {
    const marketHashName = entry.marketHashName.trim();
    const invalidName = marketHashName.length === 0;
    const invalidQuantity = !Number.isInteger(entry.quantity) || entry.quantity < 0;
    const missingFloor = entry.minPriceCents === null || !Number.isInteger(entry.minPriceCents) || entry.minPriceCents < CENTS_MIN_FLOOR;
    const category = invalidName ? "unknown" : inferCatalogCategory(marketHashName);
    const type = inferCatalogType(category);

    let tier: CatalogQueueTier = "standard";
    if (!invalidQuantity && (isDiscontinuedLikeName(marketHashName) || entry.quantity <= LOW_SUPPLY_MAX_QUANTITY)) {
        tier = "low_supply_discontinued";
    } else if (!invalidQuantity && entry.quantity >= LIQUID_MIN_QUANTITY) {
        tier = "liquid";
    }

    return {
        tier,
        priority: priorityForTier(tier, entry),
        category,
        type,
        disabledReason: invalidName || invalidQuantity ? "invalid_catalog_entry" : missingFloor ? "missing_floor" : null,
    };
}

export function scheduleNextRunAt(tier: CatalogQueueTier, now: Date = new Date(), random: () => number = Math.random): Date {
    if (tier === "low_supply_discontinued") {
        return new Date(now.getTime() + randomWindowMs(30 * MINUTE_MS, 60 * MINUTE_MS, random));
    }
    if (tier === "liquid") {
        return new Date(now.getTime() + randomWindowMs(2 * HOUR_MS, 6 * HOUR_MS, random));
    }
    return new Date(now.getTime() + randomWindowMs(6 * HOUR_MS, 12 * HOUR_MS, random));
}

export function orderCatalogEntries(entries: CatalogSeedEntry[]): CatalogSeedEntry[] {
    return [...entries].sort((a, b) => {
        const rankDelta = relevanceRank(a) - relevanceRank(b);
        if (rankDelta !== 0) return rankDelta;

        const quantityDelta = b.quantity - a.quantity;
        if (quantityDelta !== 0) return quantityDelta;

        const floorDelta = floorForSort(b) - floorForSort(a);
        if (floorDelta !== 0) return floorDelta;

        return a.marketHashName.localeCompare(b.marketHashName);
    });
}

export async function seedIntelligenceCatalog(options: CatalogSeedOptions = {}): Promise<CatalogSeedResult> {
    const now = options.now ?? new Date();
    const random = options.random ?? Math.random;
    const cap = Math.min(Math.max(1, options.cap ?? DEFAULT_CATALOG_CAP), DEFAULT_CATALOG_CAP);
    const cursor = Math.max(0, options.cursor ?? 0);
    const fetchPriceList = options.fetchPriceList ?? (() => fetchCsfloatPriceList({ now }));
    const isScmTradable = options.isScmTradable ?? (() => true);

    const priceList = await fetchPriceList();
    if (!priceList.ok || !priceList.normalized) {
        return {
            status: "failed",
            seeded: 0,
            disabled: 0,
            skipped: 0,
            progress: { cursor, nextCursor: null, totalEntries: 0, processedEntries: 0, cap, hasMore: false },
            error: priceList.failure?.message ?? "CSFloat price-list unavailable",
        };
    }

    const ordered = orderCatalogEntries(priceList.normalized.entries.map(toCatalogEntry));
    const batch = ordered.slice(cursor, cursor + cap);
    const nextCursor = cursor + batch.length < ordered.length ? cursor + batch.length : null;
    let seeded = 0;
    let disabled = 0;
    let skipped = 0;

    for (const entry of batch) {
        const classification = classifyCatalogEntry(entry);
        const marketHashName = entry.marketHashName.trim();
        if (classification.disabledReason === "invalid_catalog_entry") {
            skipped += 1;
            continue;
        }

        const tradableDisabledReason: CatalogDisabledReason | null = isScmTradable(entry) ? null : "scm_not_tradable";
        const disabledReason = classification.disabledReason ?? tradableDisabledReason;
        const status: CatalogQueueStatus = disabledReason ? "disabled" : "pending";
        const nextRunAt = scheduleNextRunAt(classification.tier, now, random);
        const item = await prisma.item.upsert({
            where: { marketHashName },
            create: {
                marketHashName,
                name: marketHashName,
                category: classification.category,
                type: classification.type ?? undefined,
                isActive: status === "pending",
            },
            update: {},
        });

        await prisma.intelligenceQueueItem.upsert({
            where: { itemId: item.id },
            create: {
                itemId: item.id,
                nextRunAt,
                priority: status === "pending" ? classification.priority : -1,
                tier: classification.tier,
                attempts: 0,
                lastError: disabledReason,
                lockedUntil: null,
                lastFetchedAt: null,
                disabledReason,
                status,
            },
            update: {
                nextRunAt,
                priority: status === "pending" ? classification.priority : -1,
                tier: classification.tier,
                attempts: 0,
                lastError: disabledReason,
                lockedUntil: null,
                disabledReason,
                status,
            },
        });

        if (status === "disabled") disabled += 1;
        else seeded += 1;
    }

    return {
        status: "success",
        seeded,
        disabled,
        skipped,
        progress: {
            cursor,
            nextCursor,
            totalEntries: ordered.length,
            processedEntries: batch.length,
            cap,
            hasMore: nextCursor !== null,
        },
    };
}
