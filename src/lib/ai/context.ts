import { prisma } from "@/lib/db";
import { extractItemMention } from "@/lib/ai/item-mentions";
import { resolveMarketSource } from "@/lib/market/source";
import { fetchRssFeeds } from "@/lib/news/rss-feeds";
import { listRecentAegisMemories } from "@/lib/aegis/memory/search";
import type { MarketContext } from "@/types";

const MAX_WATCHLIST_ITEMS = 20;
const MAX_SOLD_ITEMS = 10;
const MAX_NEWS_HEADLINES = 5;
const MAX_AEGIS_MEMORIES = 5;
const MAX_ACTIVE_ITEMS_FOR_MARKET_SCAN = 50;
const TARGET_PRICE_HISTORY_DAYS = 90;
const TARGET_CANDLE_HISTORY_DAYS = 30;

function formatTimeSince(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

function formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
}

function formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
}

function normalizeMemoryTags(tags: unknown): string[] {
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function formatSignedPercent(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function buildResearchPacket(
    context: MarketContext,
    activeItemCount: number,
    activeItemsScanned: number,
    priceSource: string
): NonNullable<MarketContext["researchPacket"]> {
    const currentPricingSignals = [
        ...context.topGainers.map(item => `Top gainer ${item.name}: ${formatPrice(item.price)} (${formatSignedPercent(item.changePercent)})`),
        ...context.topLosers.map(item => `Top loser ${item.name}: ${formatPrice(item.price)} (${formatSignedPercent(item.changePercent)})`),
        ...(context.watchlist ?? []).slice(0, 5).map(item => `Watchlist ${item.name}: ${formatPrice(item.currentPrice)} (${formatSignedPercent(item.changePercent)})`),
    ];

    const historicalSignals: string[] = [];
    if (context.targetedItemData) {
        const target = context.targetedItemData;
        const firstDailyPoint = target.historyDaily[0];
        const latestDailyPoint = target.historyDaily[target.historyDaily.length - 1];
        if (firstDailyPoint && latestDailyPoint) {
            const trend = firstDailyPoint.price > 0
                ? ((latestDailyPoint.price - firstDailyPoint.price) / firstDailyPoint.price) * 100
                : 0;
            historicalSignals.push(`${target.name}: ${target.allHistoryPoints} total price snapshots available; ${target.historyWindowDays}-day prompt window trend ${formatSignedPercent(trend)} from ${formatPrice(firstDailyPoint.price)} to ${formatPrice(latestDailyPoint.price)}.`);
        } else {
            historicalSignals.push(`${target.name}: matched item with current price ${formatPrice(target.currentPrice)}, but no daily history points were available.`);
        }

        if (target.ohlcvDaily && target.ohlcvDaily.length > 0) {
            const volumeTotal = target.ohlcvDaily.reduce((total, candle) => total + candle.volume, 0);
            historicalSignals.push(`${target.name}: ${target.ohlcvDaily.length} OHLCV candles retrieved across ${target.ohlcvWindowDays ?? TARGET_CANDLE_HISTORY_DAYS} days with total recorded volume ${volumeTotal}.`);
        }
    }

    const dataLimits = [
        `Current-price market scan is capped at ${activeItemsScanned} of ${activeItemCount} active tracked items to keep the chat context bounded.`,
    ];
    if (!context.targetedItemData) {
        dataLimits.push("No specific tracked item matched the latest user query, so item-level historical series were not retrieved for this turn.");
    }

    return {
        generatedAt: new Date().toISOString(),
        retrievalMode: "Researcher-first market data packet",
        coverage: [
            `${activeItemCount} active tracked items known to CS2Vault; ${activeItemsScanned} scanned for latest price movement signals.`,
            `${context.watchlist?.length ?? 0} global watchlist items summarized.`,
            `Price source resolved to ${priceSource}.`,
            context.targetedItemData
                ? `Matched targeted item ${context.targetedItemData.name} with ${context.targetedItemData.allHistoryPoints} total historical price snapshots.`
                : "No targeted item match for this query.",
        ],
        currentPricingSignals,
        historicalSignals,
        dataLimits,
    };
}

export async function buildMarketContext(userId?: string, query?: string): Promise<MarketContext> {
    const context: MarketContext = {
        topGainers: [],
        topLosers: [],
        userQuery: "",
    };

    try {
        const [items, activeItemCount, settings, marketCapSnapshot, latestSync] = await Promise.all([
            prisma.item.findMany({
                where: { isActive: true },
                take: MAX_ACTIVE_ITEMS_FOR_MARKET_SCAN,
                include: {
                    priceSnapshots: {
                        orderBy: { timestamp: "desc" },
                        take: 2,
                    },
                },
            }),
            prisma.item.count({ where: { isActive: true } }),
            prisma.appSettings.findUnique({ where: { id: "singleton" } }),
            prisma.marketCapSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
            prisma.syncLog.findFirst({
                where: { status: "success" },
                orderBy: { timestamp: "desc" },
            }),
        ]);

        const withChange = items.map(item => {
            const current = item.priceSnapshots[0]?.price || 0;
            const prev = item.priceSnapshots[1]?.price || current;
            const changePercent = prev > 0 ? ((current - prev) / prev) * 100 : 0;
            return { name: item.name, price: current, changePercent };
        }).filter(i => i.price > 0 && i.changePercent !== 0);

        withChange.sort((a, b) => b.changePercent - a.changePercent);
        context.topGainers = withChange.slice(0, 5);
        context.topLosers = withChange.slice(-5).reverse();

        const activeSource = resolveMarketSource(settings?.activeMarketSource);
        const watchlistCount = await prisma.item.count({
            where: { isActive: true, isWatched: true },
        });

        context.marketOverview = {
            totalMarketCap: marketCapSnapshot?.totalMarketCap ?? 0,
            trackedItemCount: activeItemCount,
            watchlistCount,
            priceSource: activeSource,
            lastSyncAge: latestSync ? formatTimeSince(latestSync.timestamp) : undefined,
        };

        if (userId) {
            const [activeInventory, soldInventory] = await Promise.all([
                prisma.inventoryItem.findMany({ where: { userId, soldAt: null } }),
                prisma.inventoryItem.findMany({
                    where: { userId, soldAt: { not: null } },
                    orderBy: { soldAt: "desc" },
                    take: MAX_SOLD_ITEMS,
                }),
            ]);

            if (activeInventory.length > 0) {
                const itemIds = [...new Set(activeInventory.map(i => i.itemId))];
                const [latestPrices, itemDetails] = await Promise.all([
                    prisma.priceSnapshot.findMany({
                        where: { itemId: { in: itemIds } },
                        orderBy: { timestamp: "desc" },
                        distinct: ["itemId"],
                    }),
                    prisma.item.findMany({
                        where: { id: { in: itemIds } },
                        select: { id: true, name: true, rarity: true, exterior: true },
                    }),
                ]);

                const priceMap = new Map(latestPrices.map(p => [p.itemId, p.price]));
                const itemMap = new Map(itemDetails.map(i => [i.id, i]));

                let totalValue = 0;
                let totalAcquired = 0;

                const inventorySummary = new Map<string, {
                    name: string;
                    quantity: number;
                    currentPrice: number;
                    totalAcquired: number;
                    totalPnl: number;
                    rarity?: string;
                    exterior?: string;
                }>();

                for (const inv of activeInventory) {
                    const price = priceMap.get(inv.itemId) || 0;
                    const acquired = inv.acquiredPrice ?? 0;
                    const hasCostBasis = inv.acquiredPrice !== null && inv.acquiredPrice !== undefined;
                    const detail = itemMap.get(inv.itemId);
                    const name = detail?.name || "Unknown Item";

                    if (price > 0) {
                        totalValue += price;
                        if (hasCostBasis) totalAcquired += acquired;
                    }

                    const existing = inventorySummary.get(inv.itemId);
                    if (existing) {
                        existing.quantity += 1;
                        existing.totalAcquired += acquired;
                        existing.totalPnl += (price && hasCostBasis) ? (price - acquired) : 0;
                    } else {
                        inventorySummary.set(inv.itemId, {
                            name,
                            quantity: 1,
                            currentPrice: price,
                            totalAcquired: acquired,
                            totalPnl: (price && hasCostBasis) ? (price - acquired) : 0,
                            rarity: detail?.rarity ?? undefined,
                            exterior: detail?.exterior ?? undefined,
                        });
                    }
                }

                context.inventory = Array.from(inventorySummary.values()).map(s => ({
                    name: s.name,
                    quantity: s.quantity,
                    currentPrice: s.currentPrice,
                    acquiredPrice: s.quantity > 0 ? s.totalAcquired / s.quantity : 0,
                    pnl: s.totalPnl,
                    rarity: s.rarity,
                    exterior: s.exterior,
                }));

                let totalRealizedPnl = 0;
                if (soldInventory.length > 0) {
                    const soldItemIds = [...new Set(soldInventory.map(i => i.itemId))];
                    const soldItemDetails = await prisma.item.findMany({
                        where: { id: { in: soldItemIds } },
                        select: { id: true, name: true },
                    });
                    const soldItemMap = new Map(soldItemDetails.map(i => [i.id, i.name]));

                    context.soldItems = soldInventory
                        .filter(s => s.soldPrice != null && s.acquiredPrice != null)
                        .map(s => {
                            const pnl = (s.soldPrice! - s.acquiredPrice!);
                            totalRealizedPnl += pnl;
                            return {
                                name: soldItemMap.get(s.itemId) || "Unknown",
                                acquiredPrice: s.acquiredPrice!,
                                soldPrice: s.soldPrice!,
                                realizedPnl: pnl,
                                soldAt: s.soldAt!.toISOString().split("T")[0],
                            };
                        });
                }

                context.portfolioSummary = {
                    totalValue,
                    unrealizedPnL: totalAcquired > 0 ? (totalValue - totalAcquired) : (totalValue > 0 ? totalValue : 0),
                    realizedPnL: totalRealizedPnl,
                    itemCount: activeInventory.length,
                    soldCount: soldInventory.length,
                };
            }

            const memories = await listRecentAegisMemories(userId, MAX_AEGIS_MEMORIES);
            if (memories.length > 0) {
                context.aegisMemories = memories.map((memory) => ({
                    title: memory.title,
                    content: memory.content,
                    kind: memory.kind,
                    tags: normalizeMemoryTags(memory.tags),
                }));
            }
        }

        const watchlistItems = await prisma.item.findMany({
            where: { isActive: true, isWatched: true },
            take: MAX_WATCHLIST_ITEMS,
            include: {
                priceSnapshots: {
                    orderBy: { timestamp: "desc" },
                    take: 2,
                },
            },
        });

        if (watchlistItems.length > 0) {
            context.watchlist = watchlistItems
                .map((item) => {
                    const current = item.priceSnapshots[0]?.price || 0;
                    const prev = item.priceSnapshots[1]?.price || current;
                    const changePercent = prev > 0 ? ((current - prev) / prev) * 100 : 0;
                    return {
                        name: item.name,
                        currentPrice: current,
                        changePercent,
                        rarity: item.rarity ?? undefined,
                    };
                })
                .filter(i => i.currentPrice > 0);
        }

        if (query) {
            const matchedItem = await findMatchingItem(query);

            if (matchedItem) {
                const priceHistoryWindowStart = new Date(Date.now() - TARGET_PRICE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
                const candleHistoryWindowStart = new Date(Date.now() - TARGET_CANDLE_HISTORY_DAYS * 24 * 60 * 60 * 1000);

                const [history, itemMeta, candles] = await Promise.all([
                    prisma.priceSnapshot.findMany({
                        where: { itemId: matchedItem.id },
                        orderBy: { timestamp: "asc" },
                        select: { price: true, timestamp: true },
                    }),
                    prisma.item.findUnique({
                        where: { id: matchedItem.id },
                        select: { rarity: true, exterior: true, category: true },
                    }),
                    prisma.candlestick.findMany({
                        where: {
                            itemId: matchedItem.id,
                            interval: "1d",
                            timestamp: { gte: candleHistoryWindowStart },
                        },
                        orderBy: { timestamp: "asc" },
                    }),
                ]);

                if (history.length > 0) {
                    const latestSnapshot = history[history.length - 1];
                    const historyInPromptWindow = history.filter(snapshot => snapshot.timestamp >= priceHistoryWindowStart);
                    const promptHistory = historyInPromptWindow.length > 0
                        ? historyInPromptWindow
                        : history.slice(-TARGET_PRICE_HISTORY_DAYS);
                    const dailyPrices = new Map<string, number>();
                    for (const h of promptHistory) {
                        const date = formatDate(h.timestamp);
                        dailyPrices.set(date, h.price);
                    }

                    context.targetedItemData = {
                        name: matchedItem.name,
                        currentPrice: latestSnapshot.price,
                        rarity: itemMeta?.rarity ?? undefined,
                        exterior: itemMeta?.exterior ?? undefined,
                        category: itemMeta?.category ?? undefined,
                        historyDaily: Array.from(dailyPrices.entries()).map(([date, price]) => ({ date, price })),
                        historyWindowDays: TARGET_PRICE_HISTORY_DAYS,
                        allHistoryPoints: history.length,
                        oldestHistoryDate: formatDate(history[0].timestamp),
                        latestHistoryDate: formatDate(latestSnapshot.timestamp),
                        ohlcvDaily: candles.length > 0
                            ? candles.map(c => ({
                                date: formatDate(c.timestamp),
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume,
                            }))
                            : undefined,
                        ohlcvWindowDays: candles.length > 0 ? TARGET_CANDLE_HISTORY_DAYS : undefined,
                    };
                }
            }
        }

        try {
            const news = await fetchRssFeeds();
            if (news.length > 0) {
                context.newsHeadlines = news.slice(0, MAX_NEWS_HEADLINES).map(n => ({
                    title: n.title,
                    source: n.source,
                    date: n.date.toISOString().split("T")[0],
                }));
            }
        } catch {
            // RSS feed failure is non-critical
        }

        context.researchPacket = buildResearchPacket(context, activeItemCount, items.length, activeSource);

    } catch (e) {
        console.error("[buildMarketContext] Failed:", e);
        context.contextError = true;
    }

    return context;
}

interface MatchingItemCandidate {
    id: string;
    name: string;
    marketHashName: string;
}

function matchesCandidateText(query: string, normalizedQuery: string, candidate: string): boolean {
    const candidateLower = candidate.toLowerCase();
    if (query.includes(candidateLower)) {
        return true;
    }

    const baseName = candidateLower.split("(")[0].trim();
    if (baseName.length > 4 && query.includes(baseName)) {
        return true;
    }

    const noPipe = baseName.replace(/\|/g, "").replace(/\s+/g, " ").trim();
    if (noPipe.length > 4 && query.includes(noPipe)) {
        return true;
    }

    const compressedCandidate = baseName.replace(/[^a-z0-9]/giu, "");
    if (compressedCandidate.length > 4 && normalizedQuery.includes(compressedCandidate)) {
        return true;
    }

    if (normalizedQuery.length > 4 && compressedCandidate.length > 4) {
        let matchCount = 0;
        let searchIndex = 0;
        for (const char of normalizedQuery) {
            const foundIndex = compressedCandidate.indexOf(char, searchIndex);
            if (foundIndex !== -1) {
                matchCount++;
                searchIndex = foundIndex + 1;
            }
        }

        if (matchCount / normalizedQuery.length > 0.8) {
            return true;
        }
    }

    return false;
}

async function findMatchingItem(query: string): Promise<{ id: string; name: string } | undefined> {
    const lowerQuery = query.toLowerCase();
    const queryClean = lowerQuery.replace(/[^a-z0-9]/giu, "");
    const activeItems = await prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, marketHashName: true },
    });

    const exactMention = extractItemMention(query);
    if (exactMention) {
        const exactMatch = activeItems.find((item) => item.marketHashName === exactMention || item.id === exactMention || item.name === exactMention);
        if (exactMatch) {
            return { id: exactMatch.id, name: exactMatch.name };
        }
    }

    activeItems.sort((a, b) => Math.max(b.name.length, b.marketHashName.length) - Math.max(a.name.length, a.marketHashName.length));

    const fuzzyMatch = activeItems.find((item: MatchingItemCandidate) => {
        return matchesCandidateText(lowerQuery, queryClean, item.marketHashName)
            || matchesCandidateText(lowerQuery, queryClean, item.name);
    });

    return fuzzyMatch ? { id: fuzzyMatch.id, name: fuzzyMatch.name } : undefined;
}
