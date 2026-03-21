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
                background: { type: ColorType.Solid, color: "#141414" },
                textColor: "#8C8C8C",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 12,
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: "#1A1A1A" },
                horzLines: { color: "#1A1A1A" },
            },
            crosshair: {
                vertLine: { color: "rgba(140, 140, 140, 0.3)", width: 1, labelBackgroundColor: "#262626" },
                horzLine: { color: "rgba(140, 140, 140, 0.3)", width: 1, labelBackgroundColor: "#262626" },
            },
            rightPriceScale: {
                borderColor: "#262626",
            },
            timeScale: {
                borderColor: "#262626",
                timeVisible: true,
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: "#00C076",
            downColor: "#FF4D4F",
            borderUpColor: "#00C076",
            borderDownColor: "#FF4D4F",
            wickUpColor: "#00C076",
            wickDownColor: "#FF4D4F",
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
                    <span style={{ fontWeight: 600, marginRight: 8, color: "var(--text-primary-90)" }}>{itemName}</span>
                )}
                {latestPrice !== null && (
                    <span
                        style={{
                            fontFamily: "var(--font-numeric)",
                            color: "var(--bull)",
                            marginRight: "auto",
                        }}
                    >
                        ${latestPrice.toFixed(2)}
                    </span>
                )}
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf.value}
                        type="button"
                        className={`timeframe-btn ${timeframe === tf.value ? "active" : ""}`}
                        onClick={() => setTimeframe(tf.value)}
                    >
                        {tf.label}
                    </button>
                ))}
            </div>
            <div ref={chartContainerRef} />
            <div className="chart-attribution">
                <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
                    <svg width="24" height="13" viewBox="0 0 36 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M14 0H22V4H18V18H14V0Z" fill="currentColor"/>
                        <path d="M24 0H26L32 18H28L24 0Z" fill="currentColor"/>
                        <path d="M36 0H32L28 18H32L36 0Z" fill="currentColor"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M0 0H12V4H8V8H12V12H8V18H4V12H0V8H4V4H0V0Z" fill="currentColor"/>
                    </svg>
                    <span>TradingView</span>
                </a>
            </div>
        </div>
    );
}
