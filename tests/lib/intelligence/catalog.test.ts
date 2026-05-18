import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
    interface ItemRow {
        id: string;
        marketHashName: string;
        name: string;
        category: string;
        type: string | null;
        isWatched: boolean;
        isActive: boolean;
    }

    interface QueueRow {
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
    }

    const items: ItemRow[] = [];
    const queueRows: QueueRow[] = [];

    function applyItemData(row: ItemRow, data: Record<string, unknown>): ItemRow {
        if (typeof data.name === "string") row.name = data.name;
        if (typeof data.category === "string") row.category = data.category;
        if ("type" in data && typeof data.type === "string") row.type = data.type;
        if ("type" in data && (data.type === null || data.type === undefined)) row.type = null;
        if (typeof data.isWatched === "boolean") row.isWatched = data.isWatched;
        if (typeof data.isActive === "boolean") row.isActive = data.isActive;
        return row;
    }

    function applyQueueData(row: QueueRow, data: Record<string, unknown>): QueueRow {
        if (data.nextRunAt instanceof Date) row.nextRunAt = data.nextRunAt;
        if (typeof data.priority === "number") row.priority = data.priority;
        if (typeof data.tier === "string") row.tier = data.tier;
        if (typeof data.attempts === "number") row.attempts = data.attempts;
        if (typeof data.lastError === "string" || data.lastError === null) row.lastError = data.lastError;
        if (data.lockedUntil instanceof Date || data.lockedUntil === null) row.lockedUntil = data.lockedUntil;
        if (data.lastFetchedAt instanceof Date || data.lastFetchedAt === null) row.lastFetchedAt = data.lastFetchedAt;
        if (typeof data.disabledReason === "string" || data.disabledReason === null) row.disabledReason = data.disabledReason;
        if (typeof data.status === "string") row.status = data.status;
        return row;
    }

    return {
        items,
        queueRows,
        item: {
            upsert: vi.fn(async ({ where, create, update }: { where: { marketHashName: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
                const existing = items.find((item) => item.marketHashName === where.marketHashName);
                if (existing) return applyItemData(existing, update);
                const row: ItemRow = {
                    id: `item-${items.length + 1}`,
                    marketHashName: String(create.marketHashName),
                    name: String(create.name),
                    category: String(create.category),
                    type: typeof create.type === "string" ? create.type : null,
                    isWatched: create.isWatched === true,
                    isActive: create.isActive !== false,
                };
                items.push(row);
                return row;
            }),
        },
        intelligenceQueueItem: {
            upsert: vi.fn(async ({ where, create, update }: { where: { itemId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
                const existing = queueRows.find((row) => row.itemId === where.itemId);
                if (existing) return applyQueueData(existing, update);
                const row: QueueRow = {
                    itemId: String(create.itemId),
                    nextRunAt: create.nextRunAt instanceof Date ? create.nextRunAt : new Date(0),
                    priority: Number(create.priority),
                    tier: String(create.tier),
                    attempts: Number(create.attempts),
                    lastError: typeof create.lastError === "string" ? create.lastError : null,
                    lockedUntil: create.lockedUntil instanceof Date ? create.lockedUntil : null,
                    lastFetchedAt: create.lastFetchedAt instanceof Date ? create.lastFetchedAt : null,
                    disabledReason: typeof create.disabledReason === "string" ? create.disabledReason : null,
                    status: String(create.status),
                };
                queueRows.push(row);
                return row;
            }),
        },
    };
});

vi.mock("@/lib/db", () => ({
    prisma: {
        item: mockDb.item,
        intelligenceQueueItem: mockDb.intelligenceQueueItem,
    },
}));

vi.mock("@/lib/market/intelligence/providers", () => ({
    fetchCsfloatPriceList: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { classifyCatalogEntry, orderCatalogEntries, scheduleNextRunAt, seedIntelligenceCatalog, type CatalogSeedEntry } from "@/lib/market/intelligence/catalog";
import { fetchCsfloatPriceList, type CsfloatPriceListNormalizedPayload, type IntelligenceProviderResult } from "@/lib/market/intelligence/providers";

const NOW = new Date("2026-05-15T12:00:00.000Z");

function priceListResult(entries: CatalogSeedEntry[]): IntelligenceProviderResult<CsfloatPriceListNormalizedPayload> {
    return {
        ok: true,
        source: "csfloat",
        cacheHit: { hit: true, fetchedAt: NOW, expiresAt: new Date(NOW.getTime() + 20 * 60 * 1000) },
        normalized: {
            entries: entries.map((entry) => ({
                marketHashName: entry.marketHashName,
                quantity: entry.quantity,
                minPriceCents: entry.minPriceCents ?? 0,
            })),
        },
    };
}

function standardEntry(index: number): CatalogSeedEntry {
    return {
        marketHashName: `Standard Catalog Item ${index}`,
        quantity: 250,
        minPriceCents: 100 + index,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.items.length = 0;
    mockDb.queueRows.length = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
        throw new Error("network calls are forbidden in catalog tests");
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("intelligence catalog classification", () => {
    it("classifies cases, stickers, low quantity, liquid supply, and standard entries", () => {
        expect(classifyCatalogEntry({ marketHashName: "Fracture Case", quantity: 10_000, minPriceCents: 80 }).tier).toBe("low_supply_discontinued");
        expect(classifyCatalogEntry({ marketHashName: "Sticker | Crown", quantity: 700, minPriceCents: 50_000 }).tier).toBe("low_supply_discontinued");
        expect(classifyCatalogEntry({ marketHashName: "AK-47 | Rare Skin", quantity: 100, minPriceCents: 1_200 }).tier).toBe("low_supply_discontinued");
        expect(classifyCatalogEntry({ marketHashName: "AK-47 | Redline (Field-Tested)", quantity: 500, minPriceCents: 1_200 }).tier).toBe("liquid");
        expect(classifyCatalogEntry({ marketHashName: "M4A1-S | Standard", quantity: 250, minPriceCents: 900 }).tier).toBe("standard");
    });

    it("schedules tier windows with injected random values", () => {
        expect(scheduleNextRunAt("low_supply_discontinued", NOW, () => 0).getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);
        expect(scheduleNextRunAt("liquid", NOW, () => 0.5).getTime()).toBe(NOW.getTime() + 4 * 60 * 60 * 1000);
        expect(scheduleNextRunAt("standard", NOW, () => 0).getTime()).toBe(NOW.getTime() + 6 * 60 * 60 * 1000);
    });

    it("orders discontinued-like items first, liquid entries by supply/floor second, then standard entries", () => {
        const ordered = orderCatalogEntries([
            { marketHashName: "Standard Mid", quantity: 250, minPriceCents: 300 },
            { marketHashName: "Liquid Lower", quantity: 700, minPriceCents: 200 },
            { marketHashName: "Sticker | Rare", quantity: 900, minPriceCents: 100 },
            { marketHashName: "Liquid Higher", quantity: 900, minPriceCents: 500 },
        ]);

        expect(ordered.map((entry) => entry.marketHashName)).toEqual([
            "Sticker | Rare",
            "Liquid Higher",
            "Liquid Lower",
            "Standard Mid",
        ]);
    });
});

describe("seedIntelligenceCatalog", () => {
    it("seeds only 1000 entries from a 1500 entry fixture and reports cursor progress", async () => {
        const entries = Array.from({ length: 1_500 }, (_, index) => standardEntry(index));
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult(entries));

        const result = await seedIntelligenceCatalog({ now: NOW, random: () => 0 });

        expect(result.status).toBe("success");
        expect(result.seeded).toBe(1_000);
        expect(result.progress).toEqual({
            cursor: 0,
            nextCursor: 1_000,
            totalEntries: 1_500,
            processedEntries: 1_000,
            cap: 1_000,
            hasMore: true,
        });
        expect(prisma.item.upsert).toHaveBeenCalledTimes(1_000);
        expect(prisma.intelligenceQueueItem.upsert).toHaveBeenCalledTimes(1_000);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("continues from an explicit cursor without processing the full catalog", async () => {
        const entries = Array.from({ length: 1_500 }, (_, index) => standardEntry(index));
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult(entries));

        const result = await seedIntelligenceCatalog({ now: NOW, random: () => 0, cursor: 1_000 });

        expect(result.seeded).toBe(500);
        expect(result.progress.nextCursor).toBeNull();
        expect(result.progress.hasMore).toBe(false);
        expect(prisma.item.upsert).toHaveBeenCalledTimes(500);
    });

    it("creates disabled queue rows for missing floors and SCM-not-tradable entries", async () => {
        const entries: CatalogSeedEntry[] = [
            { marketHashName: "Missing Floor Item", quantity: 600, minPriceCents: null },
            { marketHashName: "SCM Blocked Item", quantity: 250, minPriceCents: 1_000 },
            { marketHashName: "Tradable Liquid Item", quantity: 900, minPriceCents: 2_000 },
        ];
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult(entries));

        const result = await seedIntelligenceCatalog({
            now: NOW,
            random: () => 0,
            isScmTradable: (entry) => entry.marketHashName !== "SCM Blocked Item",
        });

        expect(result.seeded).toBe(1);
        expect(result.disabled).toBe(2);
        const disabledRows = mockDb.queueRows.filter((row) => row.status === "disabled");
        expect(disabledRows.map((row) => row.disabledReason).sort()).toEqual(["missing_floor", "scm_not_tradable"]);
        expect(disabledRows.every((row) => row.priority === -1 && row.attempts === 0)).toBe(true);
        expect(mockDb.items.find((item) => item.marketHashName === "Missing Floor Item")?.isActive).toBe(false);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("preserves existing item metadata while still upserting its queue row", async () => {
        mockDb.items.push({
            id: "existing-item",
            marketHashName: "Existing Curated Item",
            name: "Curated Display Name",
            category: "curated-category",
            type: "curated-type",
            isWatched: true,
            isActive: false,
        });
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult([
            { marketHashName: "Existing Curated Item", quantity: 5_000, minPriceCents: 2_500 },
        ]));

        const result = await seedIntelligenceCatalog({ now: NOW, random: () => 0 });

        expect(result.seeded).toBe(1);
        expect(mockDb.items).toHaveLength(1);
        expect(mockDb.items[0]).toEqual({
            id: "existing-item",
            marketHashName: "Existing Curated Item",
            name: "Curated Display Name",
            category: "curated-category",
            type: "curated-type",
            isWatched: true,
            isActive: false,
        });
        expect(prisma.item.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { marketHashName: "Existing Curated Item" },
            update: {},
        }));
        expect(mockDb.queueRows).toHaveLength(1);
        expect(mockDb.queueRows[0]).toEqual(expect.objectContaining({
            itemId: "existing-item",
            tier: "liquid",
            status: "pending",
            attempts: 0,
        }));
    });

    it("writes expected queue tier, priority, status, attempts, and schedule fields", async () => {
        vi.mocked(fetchCsfloatPriceList).mockResolvedValue(priceListResult([
            { marketHashName: "Dreams & Nightmares Case", quantity: 5_000, minPriceCents: 100 },
            { marketHashName: "AK-47 | Liquid", quantity: 900, minPriceCents: 2_000 },
            { marketHashName: "M4A4 | Standard", quantity: 250, minPriceCents: 700 },
        ]));

        await seedIntelligenceCatalog({ now: NOW, random: () => 0 });

        expect(mockDb.queueRows.map((row) => ({ tier: row.tier, status: row.status, attempts: row.attempts }))).toEqual([
            { tier: "low_supply_discontinued", status: "pending", attempts: 0 },
            { tier: "liquid", status: "pending", attempts: 0 },
            { tier: "standard", status: "pending", attempts: 0 },
        ]);
        expect(mockDb.queueRows[0].nextRunAt.getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);
        expect(mockDb.queueRows[1].nextRunAt.getTime()).toBe(NOW.getTime() + 2 * 60 * 60 * 1000);
        expect(mockDb.queueRows[2].nextRunAt.getTime()).toBe(NOW.getTime() + 6 * 60 * 60 * 1000);
    });
});
