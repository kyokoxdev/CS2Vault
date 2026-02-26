"use client";

/**
 * TradingView Candlestick Chart Component
 *
 * Renders OHLCV candlestick data using TradingView Lightweight Charts.
 * Fetches data from /api/items/[id]/prices endpoint.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
    createChart,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type Time,
    ColorType,
} from "lightweight-charts";

const TIMEFRAMES = [
    { label: "1m", value: "1m" },
    { label: "5m", value: "5m" },
    { label: "15m", value: "15m" },
    { label: "1H", value: "1h" },
    { label: "4H", value: "4h" },
    { label: "1D", value: "1d" },
    { label: "1W", value: "1w" },
] as const;

interface CandlestickChartProps {
    itemId: string;
    itemName?: string;
    height?: number;
}

export default function CandlestickChart({
    itemId,
    itemName,
    height = 400,
}: CandlestickChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const [timeframe, setTimeframe] = useState("1d");
    const [latestPrice, setLatestPrice] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/items/${itemId}/prices?interval=${timeframe}&limit=200`
            );
            const json = await res.json();
            if (!json.success) return;

            const { candlesticks, latestPrice: price } = json.data;
            setLatestPrice(price);

            if (seriesRef.current && candlesticks.length > 0) {
                const data: CandlestickData<Time>[] = candlesticks.map(
                    (c: { time: number; open: number; high: number; low: number; close: number }) => ({
                        time: c.time as Time,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                    })
                );
                seriesRef.current.setData(data);
                chartRef.current?.timeScale().fitContent();
            }
        } catch (err) {
            console.error("[Chart] Fetch failed:", err);
        }
    }, [itemId, timeframe]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: "#15151f" },
                textColor: "#8888a0",
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: "#1e1e2e" },
                horzLines: { color: "#1e1e2e" },
            },
            crosshair: {
                vertLine: { color: "#6c5ce750", width: 1, labelBackgroundColor: "#6c5ce7" },
                horzLine: { color: "#6c5ce750", width: 1, labelBackgroundColor: "#6c5ce7" },
            },
            rightPriceScale: {
                borderColor: "#2a2a3d",
            },
            timeScale: {
                borderColor: "#2a2a3d",
                timeVisible: true,
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: "#00d68f",
            downColor: "#ff6b6b",
            borderUpColor: "#00d68f",
            borderDownColor: "#ff6b6b",
            wickUpColor: "#00d68f",
            wickDownColor: "#ff6b6b",
        });

        chartRef.current = chart;
        seriesRef.current = series;

        // Resize observer
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                chart.applyOptions({ width: entry.contentRect.width });
            }
        });
        ro.observe(chartContainerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [height]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="chart-container">
            <div className="chart-toolbar">
                {itemName && (
                    <span style={{ fontWeight: 600, marginRight: 8 }}>{itemName}</span>
                )}
                {latestPrice !== null && (
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--green)",
                            marginRight: "auto",
                        }}
                    >
                        ${latestPrice.toFixed(2)}
                    </span>
                )}
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf.value}
                        className={`timeframe-btn ${timeframe === tf.value ? "active" : ""}`}
                        onClick={() => setTimeframe(tf.value)}
                    >
                        {tf.label}
                    </button>
                ))}
            </div>
            <div ref={chartContainerRef} />
        </div>
    );
}
