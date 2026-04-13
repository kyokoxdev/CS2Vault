/**
 * POST /api/portfolio/prices — Refresh price snapshots for portfolio items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { writePriceSnapshotsForItems, writePriceSnapshotsForItemsInChunks } from "@/lib/market/pricing";
import { z } from "zod";

const RefreshPortfolioPricesSchema = z.object({
    itemIds: z.array(z.string().min(1)).max(200).optional(),
    skipCandleAggregation: z.boolean().optional(),
    bulkOnly: z.boolean().optional(),
});

function buildPortfolioItemMap(
    inventoryItems: Array<{ item: { id: string; marketHashName: string } }>
): Map<string, string> {
    const itemIdByHash = new Map<string, string>();
    for (const inv of inventoryItems) {
        itemIdByHash.set(inv.item.marketHashName, inv.item.id);
    }
    return itemIdByHash;
}

async function getPortfolioInventoryItems(userId: string, requestedItemIds?: string[]) {
    return prisma.inventoryItem.findMany({
        where: {
            userId,
            soldAt: null,
            ...(requestedItemIds?.length ? { itemId: { in: requestedItemIds } } : {}),
        },
        include: {
            item: { select: { id: true, marketHashName: true } },
        },
    });
}

function createStreamEvent(type: string, data: unknown): string {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
    const encoder = new TextEncoder();

    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const requestUrl = request.nextUrl ?? new URL(request.url);
        const fallbackParam = requestUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";
        const userId = session.user.id;
        const inventoryItems = await getPortfolioInventoryItems(userId);
        const itemIdByHash = buildPortfolioItemMap(inventoryItems);
        const totalItems = itemIdByHash.size;

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                void (async () => {
                    try {
                        controller.enqueue(encoder.encode(createStreamEvent("start", {
                            total: totalItems,
                            pricedCount: 0,
                        })));

                        if (totalItems === 0) {
                            controller.enqueue(encoder.encode(createStreamEvent("complete", {
                                total: 0,
                                pricedCount: 0,
                                provider: allowFallback ? "steam" : "csfloat",
                                fallbackAvailable: false,
                                failureReason: null,
                                attemptedProvider: allowFallback ? "steam" : "csfloat",
                            })));
                            controller.close();
                            return;
                        }

                        const pricingResult = await writePriceSnapshotsForItemsInChunks(itemIdByHash, {
                            minAgeMinutes: undefined,
                            allowSteamLimit: false,
                            allowFallback,
                            ...(allowFallback ? { overrideSource: "steam" as const } : {}),
                            onProgress(progress) {
                                controller.enqueue(encoder.encode(createStreamEvent("progress", progress)));
                            },
                        });

                        controller.enqueue(encoder.encode(createStreamEvent("complete", {
                            total: totalItems,
                            pricedCount: pricingResult.pricedCount,
                            skippedRecent: pricingResult.skippedRecent,
                            provider: pricingResult.provider,
                            fallbackAvailable: pricingResult.fallbackAvailable,
                            failureReason: pricingResult.failureReason ?? null,
                            attemptedProvider: pricingResult.attemptedProvider,
                        })));
                        controller.close();
                    } catch (error) {
                        controller.enqueue(encoder.encode(createStreamEvent("error", {
                            message: error instanceof Error ? error.message : "Failed to refresh portfolio prices",
                        })));
                        controller.close();
                    }
                })();
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        console.error("[API /portfolio/prices GET]", error);
        return NextResponse.json(
            { success: false, error: "Failed to stream portfolio prices" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;
        const parsedBody = RefreshPortfolioPricesSchema.safeParse(await request.json().catch(() => ({})));

        if (!parsedBody.success) {
            return NextResponse.json(
                { success: false, error: "Invalid portfolio refresh request" },
                { status: 400 }
            );
        }

        const requestedItemIds = parsedBody.data.itemIds;
        const skipCandleAggregation = parsedBody.data.skipCandleAggregation ?? false;
        const bulkOnly = parsedBody.data.bulkOnly ?? false;

        if (requestedItemIds && requestedItemIds.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    pricedCount: 0,
                    priceSource: null,
                    priceCoverage: {
                        total: 0,
                        priced: 0,
                        candidates: 0,
                    },
                    priceSkippedRecent: 0,
                    priceLimitedTo: null,
                    fallbackAvailable: false,
                    failureReason: null,
                    attemptedProvider: null,
                },
            });
        }

        const inventoryItems = await getPortfolioInventoryItems(userId, requestedItemIds);
        const itemIdByHash = buildPortfolioItemMap(inventoryItems);

        const requestUrl = request.nextUrl ?? new URL(request.url);
        const fallbackParam = requestUrl.searchParams.get("fallback");
        const allowFallback = fallbackParam === "steam";

        const pricingResult = await writePriceSnapshotsForItems(itemIdByHash, {
            minAgeMinutes: undefined,
            allowSteamLimit: true,
            allowFallback,
            skipCandleAggregation,
            bulkOnly,
            ...(allowFallback ? { overrideSource: "steam" } : {}),
        });

        return NextResponse.json({
            success: true,
            data: {
                pricedCount: pricingResult.pricedCount,
                priceSource: pricingResult.provider,
                priceCoverage: {
                    total: pricingResult.totalRequested,
                    priced: pricingResult.pricedCount,
                    candidates: pricingResult.totalCandidates,
                },
                priceSkippedRecent: pricingResult.skippedRecent,
                priceLimitedTo: pricingResult.limitedTo ?? null,
                fallbackAvailable: pricingResult.fallbackAvailable,
                failureReason: pricingResult.failureReason ?? null,
                attemptedProvider: pricingResult.attemptedProvider,
            },
        });
    } catch (error) {
        console.error("[API /portfolio/prices POST]", error);
        return NextResponse.json(
            { success: false, error: "Failed to refresh portfolio prices" },
            { status: 500 }
        );
    }
}
