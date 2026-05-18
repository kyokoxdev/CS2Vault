import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        intelligenceConfig: { upsert: vi.fn() },
        intelligenceQueueItem: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
        intelligenceProviderCache: { findUnique: vi.fn(), upsert: vi.fn() },
        intelligenceObservation: { create: vi.fn() },
        intelligenceSignal: { upsert: vi.fn() },
        intelligenceSignalEvent: { create: vi.fn() },
    },
}));

import { prisma } from "@/lib/db";

const TEST_DATE = new Date("2026-05-15T12:00:00.000Z");

describe("Intelligence Prisma schema contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("supports singleton IntelligenceConfig upserts with circuit breaker and JSON budget fields", async () => {
        await prisma.intelligenceConfig.upsert({
            where: { id: "default" },
            create: {
                id: "default",
                liveScmEnabled: false,
                circuitBreakerUntil: null,
                consecutiveProviderFailures: 0,
                lastRunAt: null,
                lastError: null,
                requestBudget: {
                    scm: { perMinute: 19, perDay: 950 },
                    csfloat: { perMinute: 4 },
                },
            },
            update: {
                lastRunAt: TEST_DATE,
                lastError: null,
                requestBudget: {
                    scm: { remainingToday: 949 },
                },
            },
        });

        expect(prisma.intelligenceConfig.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "default" },
                create: expect.objectContaining({
                    liveScmEnabled: false,
                    circuitBreakerUntil: null,
                    consecutiveProviderFailures: 0,
                    requestBudget: expect.objectContaining({ scm: expect.objectContaining({ perDay: 950 }) }),
                }),
                update: expect.objectContaining({ lastRunAt: TEST_DATE }),
            })
        );
    });

    it("supports DB-backed queue scheduling, locking, attempts, tier, priority, and status fields", async () => {
        await prisma.intelligenceQueueItem.upsert({
            where: { itemId: "item-1" },
            create: {
                itemId: "item-1",
                nextRunAt: TEST_DATE,
                priority: 10,
                tier: "high-volume",
                attempts: 0,
                lastError: null,
                lockedUntil: null,
                lastFetchedAt: null,
                disabledReason: null,
                status: "pending",
            },
            update: {
                nextRunAt: TEST_DATE,
                priority: 10,
                tier: "high-volume",
                status: "pending",
                disabledReason: null,
            },
        });

        await prisma.intelligenceQueueItem.updateMany({
            where: {
                status: "pending",
                nextRunAt: { lte: TEST_DATE },
                OR: [{ lockedUntil: null }, { lockedUntil: { lt: TEST_DATE } }],
            },
            data: {
                status: "running",
                lockedUntil: new Date("2026-05-15T12:05:00.000Z"),
                attempts: { increment: 1 },
            },
        });

        expect(prisma.intelligenceQueueItem.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { itemId: "item-1" },
                create: expect.objectContaining({
                    nextRunAt: TEST_DATE,
                    priority: 10,
                    tier: "high-volume",
                    attempts: 0,
                    lastError: null,
                    lockedUntil: null,
                    lastFetchedAt: null,
                    disabledReason: null,
                    status: "pending",
                }),
            })
        );
        expect(prisma.intelligenceQueueItem.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: "pending", nextRunAt: { lte: TEST_DATE } }),
                data: expect.objectContaining({ status: "running", attempts: { increment: 1 } }),
            })
        );
    });

    it("supports provider cache upserts with lookup keys and raw plus normalized JSON payloads", async () => {
        await prisma.intelligenceProviderCache.upsert({
            where: {
                provider_lookupType_lookupKey: {
                    provider: "csfloat",
                    lookupType: "marketHashName",
                    lookupKey: "AK-47 | Redline (Field-Tested)",
                },
            },
            create: {
                provider: "csfloat",
                lookupType: "marketHashName",
                lookupKey: "AK-47 | Redline (Field-Tested)",
                itemId: "item-1",
                rawPayload: { market_hash_name: "AK-47 | Redline (Field-Tested)", min_price: 12600 },
                normalizedPayload: { priceCents: 12600, listingCount: 506 },
                fetchedAt: TEST_DATE,
                expiresAt: new Date("2026-05-15T12:30:00.000Z"),
            },
            update: {
                rawPayload: { market_hash_name: "AK-47 | Redline (Field-Tested)", min_price: 12600 },
                normalizedPayload: { priceCents: 12600, listingCount: 506 },
                fetchedAt: TEST_DATE,
                expiresAt: new Date("2026-05-15T12:30:00.000Z"),
            },
        });

        expect(prisma.intelligenceProviderCache.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    provider_lookupType_lookupKey: {
                        provider: "csfloat",
                        lookupType: "marketHashName",
                        lookupKey: "AK-47 | Redline (Field-Tested)",
                    },
                },
                create: expect.objectContaining({
                    rawPayload: expect.objectContaining({ min_price: 12600 }),
                    normalizedPayload: expect.objectContaining({ priceCents: 12600 }),
                }),
            })
        );
    });

    it("supports observation, signal, and signal event writes with cents, confidence, freshness, and JSON reasons", async () => {
        await prisma.intelligenceObservation.create({
            data: {
                itemId: "item-1",
                provider: "scm",
                observedAt: TEST_DATE,
                floorPriceCents: 790,
                medianPriceCents: 777,
                listingCount: 12,
                volume: 1113,
                confidence: 82,
                freshness: "fresh",
                status: "observed",
                reasons: [{ code: "scm-volume-spike", label: "Volume spike" }],
                rawPayload: { lowest_price: "$7.90", volume: "1,113" },
            },
        });

        await prisma.intelligenceSignal.upsert({
            where: {
                itemId_signalType_status: {
                    itemId: "item-1",
                    signalType: "accumulation",
                    status: "active",
                },
            },
            create: {
                itemId: "item-1",
                signalType: "accumulation",
                status: "active",
                confidence: 82,
                detectedAt: TEST_DATE,
                lastSeenAt: TEST_DATE,
                staleAt: new Date("2026-05-15T18:00:00.000Z"),
                priceCents: 790,
                baselineCents: 720,
                deltaCents: 70,
                reasons: [{ code: "price-above-baseline" }],
                metadata: { provider: "scm" },
            },
            update: {
                confidence: 82,
                lastSeenAt: TEST_DATE,
                priceCents: 790,
                reasons: [{ code: "price-above-baseline" }],
            },
        });

        await prisma.intelligenceSignalEvent.create({
            data: {
                signalId: "signal-1",
                itemId: "item-1",
                eventType: "detected",
                signalType: "accumulation",
                occurredAt: TEST_DATE,
                confidence: 82,
                priceCents: 790,
                baselineCents: 720,
                deltaCents: 70,
                reasons: [{ code: "price-above-baseline" }],
                metadata: { provider: "scm" },
            },
        });

        expect(prisma.intelligenceObservation.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    floorPriceCents: 790,
                    medianPriceCents: 777,
                    confidence: 82,
                    freshness: "fresh",
                    reasons: expect.arrayContaining([expect.objectContaining({ code: "scm-volume-spike" })]),
                }),
            })
        );
        expect(prisma.intelligenceSignal.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    itemId_signalType_status: expect.objectContaining({ signalType: "accumulation" }),
                }),
                create: expect.objectContaining({ priceCents: 790, baselineCents: 720, deltaCents: 70 }),
            })
        );
        expect(prisma.intelligenceSignalEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    occurredAt: TEST_DATE,
                    priceCents: 790,
                    baselineCents: 720,
                    deltaCents: 70,
                }),
            })
        );
    });
});
