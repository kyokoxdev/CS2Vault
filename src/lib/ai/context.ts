import { prisma } from "@/lib/db";
import type { MarketContext } from "@/types";

export async function buildMarketContext(userId?: string, query?: string): Promise<MarketContext> {
    const context: MarketContext = {
        topGainers: [],
        topLosers: [],
        userQuery: "" // to be populated by the caller
    };

    try {
        // Fetch active items to calculate brief market movers
        const items = await prisma.item.findMany({
            where: { isActive: true },
            take: 50, // Limit to 50 active items for context snapshot
            include: {
                priceSnapshots: {
                    orderBy: { timestamp: 'desc' },
                    take: 2
                }
            }
        });

        const withChange = items.map(item => {
            const current = item.priceSnapshots[0]?.price || 0;
            const prev = item.priceSnapshots[1]?.price || current;
            const changePercent = prev > 0 ? ((current - prev) / prev) * 100 : 0;
            return { name: item.name, price: current, changePercent };
        }).filter(i => i.price > 0 && i.changePercent !== 0);

        withChange.sort((a, b) => b.changePercent - a.changePercent);

        context.topGainers = withChange.slice(0, 5);
        context.topLosers = withChange.slice(-5).reverse();

        if (userId) {
            // Build the portfolio summary snapshot for the LLM
            const inventory = await prisma.inventoryItem.findMany({
                where: { userId, soldAt: null }
            });

            if (inventory.length > 0) {
                const itemIds = [...new Set(inventory.map(i => i.itemId))];
                const latestPrices = await prisma.priceSnapshot.findMany({
                    where: { itemId: { in: itemIds } },
                    orderBy: { timestamp: 'desc' },
                    distinct: ['itemId']
                });

                const priceMap = new Map(latestPrices.map(p => [p.itemId, p.price]));

                let totalValue = 0;
                let totalAcquired = 0;

                const inventorySummary = new Map<string, {
                    name: string;
                    quantity: number;
                    currentPrice: number;
                    totalAcquired: number;
                    totalPnl: number;
                }>();

                const itemDetails = await prisma.item.findMany({
                    where: { id: { in: itemIds } },
                    select: { id: true, name: true }
                });
                const itemMap = new Map(itemDetails.map(i => [i.id, i.name]));

                // Build detailed inventory map and calculate portfolio metrics
                for (const inv of inventory) {
                    const price = priceMap.get(inv.itemId) || 0;
                    const acquired = inv.acquiredPrice || 0;
                    const name = itemMap.get(inv.itemId) || "Unknown Item";

                    if (price > 0) {
                        totalValue += price;
                        if (acquired > 0) {
                            totalAcquired += acquired;
                        }
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
                            totalPnl: (price && acquired > 0) ? (price - acquired) : 0
                        });
                    }
                }

                context.inventory = Array.from(inventorySummary.values()).map(s => ({
                    name: s.name,
                    quantity: s.quantity,
                    currentPrice: s.currentPrice,
                    acquiredPrice: s.quantity > 0 ? s.totalAcquired / s.quantity : 0,
                    pnl: s.totalPnl
                }));

                context.portfolioSummary = {
                    totalValue,
                    unrealizedPnL: (totalAcquired > 0 && totalValue > 0) ? (totalValue - totalAcquired) : 0,
                    itemCount: inventory.length
                };
            }
        }

        // Targeted item history logic based on user query
        if (query) {
            const lowerQuery = query.toLowerCase();
            const activeItems = await prisma.item.findMany({ select: { id: true, name: true } }); // Fast projection

            // Sort by length desc to match most specific (e.g., "AK-47 | Redline (Field-Tested)") before generic
            activeItems.sort((a, b) => b.name.length - a.name.length);

            const queryClean = lowerQuery.replace(/[^a-z0-9]/g, '');

            const matchedItem = activeItems.find(item => {
                const nameLower = item.name.toLowerCase();
                if (lowerQuery.includes(nameLower)) return true;

                // Try omitting wear condition (e.g. "(Field-Tested)")
                const baseName = nameLower.split('(')[0].trim();
                if (baseName.length > 4 && lowerQuery.includes(baseName)) return true;

                // Try without the pipe (e.g. "ak-47 redline")
                const noPipe = baseName.replace('|', '').replace(/\s+/g, ' ').trim();
                if (noPipe.length > 4 && lowerQuery.includes(noPipe)) return true;

                // Try fully compressed (e.g. "ak47redline")
                const compressedName = baseName.replace(/[^a-z0-9]/g, '');
                if (compressedName.length > 4 && queryClean.includes(compressedName)) return true;

                // Substring overlap for minor typos (e.g. "awp asimov")
                const queryParts = queryClean.split('');
                if (queryClean.length > 4 && compressedName.length > 4) {
                    // Check if at least 80% of the query characters exist sequentially in the compressed name
                    let matchCount = 0;
                    let searchIndex = 0;
                    for (const char of queryParts) {
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

            if (matchedItem) {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                // Fetch the absolute latest snapshot for a static price fallback
                const latestSnapshot = await prisma.priceSnapshot.findFirst({
                    where: { itemId: matchedItem.id },
                    orderBy: { timestamp: 'desc' }
                });

                const history = await prisma.priceSnapshot.findMany({
                    where: { itemId: matchedItem.id, timestamp: { gte: thirtyDaysAgo } },
                    orderBy: { timestamp: 'asc' }
                });

                if (history.length > 0) {
                    // Aggregate to daily prices to save context tokens
                    const dailyPrices = new Map<string, number>();
                    for (const h of history) {
                        const date = h.timestamp.toISOString().split('T')[0];
                        dailyPrices.set(date, h.price); // keeps the latest price for each day
                    }

                    context.targetedItemData = {
                        name: matchedItem.name,
                        currentPrice: history[history.length - 1].price,
                        history30Days: Array.from(dailyPrices.entries()).map(([date, price]) => ({ date, price }))
                    };
                } else if (latestSnapshot) {
                    // Fallback: The item exists in DB and has a snapshot, but it's older than 30 days or just 1 data point
                    context.targetedItemData = {
                        name: matchedItem.name,
                        currentPrice: latestSnapshot.price,
                        history30Days: [] // Explicitly empty so AI knows it lacks charting history
                    };
                }
            }
        }

    } catch (e) {
        console.error("[buildMarketContext] Failed:", e);
        context.contextError = true;
    }

    return context;
}
