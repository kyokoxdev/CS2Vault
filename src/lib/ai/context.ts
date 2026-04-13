import { prisma } from "@/lib/db";
import { resolveMarketSource } from "@/lib/market/source";
import { fetchRssFeeds } from "@/lib/news/rss-feeds";
import type { MarketContext } from "@/types";

const MAX_WATCHLIST_ITEMS = 20;
const MAX_SOLD_ITEMS = 10;
const MAX_NEWS_HEADLINES = 5;

function formatTimeSince(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

export async function buildMarketContext(userId?: string, query?: string): Promise<MarketContext> {
    const context: MarketContext = {
        topGainers: [],
        topLosers: [],
        userQuery: "",
    };

    try {
        const [items, settings, marketCapSnapshot, latestSync] = await Promise.all([
            prisma.item.findMany({
                where: { isActive: true },
                take: 50,
                include: {
                    priceSnapshots: {
                        orderBy: { timestamp: "desc" },
                        take: 2,
                    },
                },
            }),
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
        const watchlistCount = await prisma.item.count({ where: { isWatched: true, isActive: true } });

        context.marketOverview = {
            totalMarketCap: marketCapSnapshot?.totalMarketCap ?? 0,
            trackedItemCount: items.length,
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
                    const acquired = inv.acquiredPrice || 0;
                    const detail = itemMap.get(inv.itemId);
                    const name = detail?.name || "Unknown Item";

                    if (price > 0) {
                        totalValue += price;
                        if (acquired > 0) totalAcquired += acquired;
                    }

                    const existing = inventorySummary.get(inv.itemId);
                    if (existing) {
                        existing.quantity += 1;
                        existing.totalAcquired += acquired;
                        existing.totalPnl += (price && acquired > 0) ? (price - acquired) : 0;
                    } else {
                        inventorySummary.set(inv.itemId, {
                            name,
                            quantity: 1,
                            currentPrice: price,
                            totalAcquired: acquired,
                            totalPnl: (price && acquired > 0) ? (price - acquired) : 0,
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
                    unrealizedPnL: (totalAcquired > 0 && totalValue > 0) ? (totalValue - totalAcquired) : 0,
                    realizedPnL: totalRealizedPnl,
                    itemCount: activeInventory.length,
                    soldCount: soldInventory.length,
                };
            }
        }

        const watchlistItems = await prisma.item.findMany({
            where: { isWatched: true, isActive: true },
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
                .map(item => {
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
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                const [latestSnapshot, history, itemMeta, candles] = await Promise.all([
                    prisma.priceSnapshot.findFirst({
                        where: { itemId: matchedItem.id },
                        orderBy: { timestamp: "desc" },
                    }),
                    prisma.priceSnapshot.findMany({
                        where: { itemId: matchedItem.id, timestamp: { gte: thirtyDaysAgo } },
                        orderBy: { timestamp: "asc" },
                    }),
                    prisma.item.findUnique({
                        where: { id: matchedItem.id },
                        select: { rarity: true, exterior: true, category: true },
                    }),
                    prisma.candlestick.findMany({
                        where: {
                            itemId: matchedItem.id,
                            interval: "1d",
                            timestamp: { gte: sevenDaysAgo },
                        },
                        orderBy: { timestamp: "asc" },
                    }),
                ]);

                if (history.length > 0) {
                    const dailyPrices = new Map<string, number>();
                    for (const h of history) {
                        const date = h.timestamp.toISOString().split("T")[0];
                        dailyPrices.set(date, h.price);
                    }

                    context.targetedItemData = {
                        name: matchedItem.name,
                        currentPrice: history[history.length - 1].price,
                        rarity: itemMeta?.rarity ?? undefined,
                        exterior: itemMeta?.exterior ?? undefined,
                        category: itemMeta?.category ?? undefined,
                        history30Days: Array.from(dailyPrices.entries()).map(([date, price]) => ({ date, price })),
                        ohlcv7Days: candles.length > 0
                            ? candles.map(c => ({
                                date: c.timestamp.toISOString().split("T")[0],
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume,
                            }))
                            : undefined,
                    };
                } else if (latestSnapshot) {
                    context.targetedItemData = {
                        name: matchedItem.name,
                        currentPrice: latestSnapshot.price,
                        rarity: itemMeta?.rarity ?? undefined,
                        exterior: itemMeta?.exterior ?? undefined,
                        category: itemMeta?.category ?? undefined,
                        history30Days: [],
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

    } catch (e) {
        console.error("[buildMarketContext] Failed:", e);
        context.contextError = true;
    }

    return context;
}

async function findMatchingItem(query: string): Promise<{ id: string; name: string } | undefined> {
    const lowerQuery = query.toLowerCase();
    const queryClean = lowerQuery.replace(/[^a-z0-9]/g, "");
    const activeItems = await prisma.item.findMany({ select: { id: true, name: true } });
    activeItems.sort((a, b) => b.name.length - a.name.length);

    return activeItems.find(item => {
        const nameLower = item.name.toLowerCase();
        if (lowerQuery.includes(nameLower)) return true;

        const baseName = nameLower.split("(")[0].trim();
        if (baseName.length > 4 && lowerQuery.includes(baseName)) return true;

        const noPipe = baseName.replace("|", "").replace(/\s+/g, " ").trim();
        if (noPipe.length > 4 && lowerQuery.includes(noPipe)) return true;

        const compressedName = baseName.replace(/[^a-z0-9]/g, "");
        if (compressedName.length > 4 && queryClean.includes(compressedName)) return true;

        if (queryClean.length > 4 && compressedName.length > 4) {
            let matchCount = 0;
            let searchIndex = 0;
            for (const char of queryClean) {
                const foundIdx = compressedName.indexOf(char, searchIndex);
                if (foundIdx !== -1) {
                    matchCount++;
                    searchIndex = foundIdx + 1;
                }
            }
            if (matchCount / queryClean.length > 0.8) return true;
        }

        return false;
    });
}
