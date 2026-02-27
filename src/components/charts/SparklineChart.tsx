"use client";

/**
 * SparklineChart Component
 *
 * Mini sparkline chart using TradingView Lightweight Charts AreaSeries.
 * Non-interactive — no tooltips, crosshair, or click handlers.
 * Auto-detects trend color (bull/bear) based on first vs last data point.
 */

import { useEffect, useRef } from "react";
import {
    createChart,
    AreaSeries,
    type IChartApi,
    type ISeriesApi,
    type Time,
    ColorType,
} from "lightweight-charts";
import styles from "./SparklineChart.module.css";

interface SparklineChartProps {
    data: { time: number; value: number }[];
    color?: string;
    width?: number;
    height?: number;
    className?: string;
}

export default function SparklineChart({
    data,
    color,
    width = 120,
    height = 32,
    className,
}: SparklineChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

    useEffect(() => {
        if (!containerRef.current || data.length === 0) return;

        // Set container dimensions via CSS custom properties
        containerRef.current.style.width = typeof width === "number" ? `${width}px` : `${width}`;
        containerRef.current.style.height = typeof height === "number" ? `${height}px` : `${height}`;

        // Auto-detect trend color
        const bullColor = "#00C076";
        const bearColor = "#FF4D4F";
        const trendColor =
            color ??
            (data[data.length - 1].value >= data[0].value
                ? bullColor
                : bearColor);

        const chart = createChart(containerRef.current, {
            width,
            height,
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "transparent",
            },
            rightPriceScale: { visible: false },
            timeScale: { visible: false },
            handleScroll: false,
            handleScale: false,
            crosshair: { mode: 0 },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
        });

        const series = chart.addSeries(AreaSeries, {
            lineColor: trendColor,
            topColor: trendColor + "26", // ~0.15 alpha
            bottomColor: trendColor + "00", // 0 alpha
            lineWidth: 2,
        });

        series.setData(
            data.map((d) => ({ time: d.time as Time, value: d.value }))
        );

        chartRef.current = chart;
        seriesRef.current = series;

        // Resize observer
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                chart.applyOptions({ width: entry.contentRect.width });
            }
        });
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [data, color, width, height]);

    if (data.length === 0) return null;

    return (
        <div
            ref={containerRef}
            className={`${styles.container}${className ? ` ${className}` : ""}`}
        />
    );
}
