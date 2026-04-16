/**
 * Candlestick Aggregator
 * 
 * Converts raw PriceSnapshot records into OHLCV candlestick data.
 * Supports multiple timeframe intervals.
 */

import { prisma } from "@/lib/db";

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

const INTERVAL_MS: Record<CandleInterval, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Get the period start timestamp for a given time and interval.
 */
function getPeriodStart(timestamp: Date, intervalMs: number): Date {
    const ts = timestamp.getTime();
    const periodStart = ts - (ts % intervalMs);
    return new Date(periodStart);
}

/**
 * Aggregate price snapshots into candlestick data for a specific item and interval.
 * This processes snapshots since the last stored candle (incremental).
 */
export async function aggregateCandlesticks(
    itemId: string,
    interval: CandleInterval
): Promise<number> {
    const intervalMs = INTERVAL_MS[interval];

    // Find the last candle timestamp for this item + interval
    const lastCandle = await prisma.candlestick.findFirst({
        where: { itemId, interval },
        orderBy: { timestamp: "desc" },
    });

    // Fetch snapshots since the last candle (or all if none exist)
    const sinceDate = lastCandle
        ? lastCandle.timestamp
        : new Date(0);

    const snapshots = await prisma.priceSnapshot.findMany({
        where: {
            itemId,
            timestamp: { gt: sinceDate },
        },
        orderBy: { timestamp: "asc" },
    });

    if (snapshots.length === 0) return 0;

    // Group snapshots by period
    const periods = new Map<
        number,
        { open: number; high: number; low: number; close: number; volume: number; timestamp: Date }
    >();

    for (const snapshot of snapshots) {
        const periodStart = getPeriodStart(snapshot.timestamp, intervalMs);
        const key = periodStart.getTime();

        const existing = periods.get(key);
        if (existing) {
            existing.high = Math.max(existing.high, snapshot.price);
            existing.low = Math.min(existing.low, snapshot.price);
            existing.close = snapshot.price; // Last price in period
            existing.volume += snapshot.volume ?? 0;
        } else {
            periods.set(key, {
                open: snapshot.price,
                high: snapshot.price,
                low: snapshot.price,
                close: snapshot.price,
                volume: snapshot.volume ?? 0,
                timestamp: periodStart,
            });
        }
    }

    // Batch upsert all candles in a single transaction to minimize DB round-trips
    const upserts = [...periods.values()].map((candle) =>
        prisma.candlestick.upsert({
            where: {
                itemId_interval_timestamp: {
                    itemId,
                    interval,
                    timestamp: candle.timestamp,
                },
            },
            create: {
                itemId,
                interval,
                ...candle,
            },
            update: {
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
            },
        })
    );

    if (upserts.length > 0) {
        await prisma.$transaction(upserts);
    }

    return upserts.length;
}

/**
 * Aggregate all intervals for a given item.
 */
export async function aggregateAllIntervals(itemId: string): Promise<void> {
    const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
    await Promise.all(intervals.map((interval) => aggregateCandlesticks(itemId, interval)));
}

/**
 * Aggregate candlesticks for all watched items.
 */
export async function aggregateAllWatchedItems(): Promise<number> {
    const watchedItems = await prisma.item.findMany({
        where: { isWatched: true, isActive: true },
        select: { id: true },
    });

    let totalCandles = 0;
    for (const item of watchedItems) {
        const intervals: CandleInterval[] = ["5m", "15m", "1h", "4h", "1d", "1w"];
        for (const interval of intervals) {
            totalCandles += await aggregateCandlesticks(item.id, interval);
        }
    }

    return totalCandles;
}
