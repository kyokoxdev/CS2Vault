"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AreaSeries,
    ColorType,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type AreaData,
    type Time,
} from "lightweight-charts";

interface MarketCapDataPoint {
    time: number;
    value: number;
    itemCount: number;
}

interface MarketCapHistoryResponse {
    success: boolean;
    data?: {
        series: MarketCapDataPoint[];
        count: number;
        latest: {
            totalMarketCap: number;
            itemCount: number;
            timestamp: string;
        } | null;
    };
    error?: string;
}

interface MarketCapStats {
    currentValue: number;
    startValue: number;
    delta: number;
    changePercent: number;
    high: number;
    low: number;
    dataPoints: number;
    trend: "up" | "down" | "flat";
}

interface MarketCapChartProps {
    height?: number;
}

const CHART_COLORS = {
    accent: "#3B82F6",
    accentArea: "rgba(59, 130, 246, 0.08)",
    text: "#8C8C8C",
    surface: "#141414",
    grid: "#1A1A1A",
    border: "#262626",
    crosshair: "rgba(140, 140, 140, 0.3)",
};

function formatMarketCap(value: number): string {
    if (value >= 1_000_000_000) {
        return `$${(value / 1_000_000_000).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}B`;
    }
    if (value >= 1_000_000) {
        return `$${(value / 1_000_000).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}M`;
    }
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatSignedMarketCap(value: number): string {
    const formatted = formatMarketCap(Math.abs(value));
    if (value === 0) return formatted;
    return `${value > 0 ? "+" : "-"}${formatted.slice(1)}`;
}

function formatPercent(value: number): string {
    const formatted = Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    if (value === 0) return `${formatted}%`;
    return `${value > 0 ? "+" : "-"}${formatted}%`;
}

function calculateStats(series: MarketCapDataPoint[]): MarketCapStats | null {
    if (series.length === 0) return null;

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;

    for (const point of series) {
        high = Math.max(high, point.value);
        low = Math.min(low, point.value);
    }

    const startValue = series[0].value;
    const currentValue = series[series.length - 1].value;
    const delta = currentValue - startValue;
    const changePercent = startValue === 0 ? 0 : (delta / startValue) * 100;

    return {
        currentValue,
        startValue,
        delta,
        changePercent,
        high,
        low,
        dataPoints: series.length,
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    };
}

export default function MarketCapChart({ height = 400 }: MarketCapChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [series, setSeries] = useState<MarketCapDataPoint[]>([]);
    const [stats, setStats] = useState<MarketCapStats | null>(null);
    const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async (force = false) => {
        if (!force) setLoading(true);
        setError(null);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/market/market-cap/history?limit=365", {
                signal: controller.signal,
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = (await res.json()) as MarketCapHistoryResponse;
            if (!json.success || !json.data) {
                throw new Error(json.error ?? "API returned unsuccessful response");
            }

            if (controller.signal.aborted) return;

            setSeries(json.data.series);
            setStats(calculateStats(json.data.series));
            setLatestTimestamp(json.data.latest?.timestamp ?? null);
        } catch (err) {
            if (controller.signal.aborted) return;
            console.error("[MarketCapChart] Fetch failed:", err);
            setError("Failed to load market cap history");
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchData();
        return () => { abortRef.current?.abort(); };
    }, [fetchData]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: CHART_COLORS.surface },
                textColor: CHART_COLORS.text,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 12,
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: CHART_COLORS.grid },
                horzLines: { color: CHART_COLORS.grid },
            },
            crosshair: {
                vertLine: {
                    color: CHART_COLORS.crosshair,
                    width: 1,
                    labelBackgroundColor: CHART_COLORS.border,
                },
                horzLine: {
                    color: CHART_COLORS.crosshair,
                    width: 1,
                    labelBackgroundColor: CHART_COLORS.border,
                },
            },
            rightPriceScale: {
                borderColor: CHART_COLORS.border,
                scaleMargins: { top: 0.08, bottom: 0.08 },
            },
            timeScale: {
                borderColor: CHART_COLORS.border,
                timeVisible: false,
            },
            localization: {
                priceFormatter: (price: number) => formatMarketCap(price),
            },
        });

        const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: CHART_COLORS.accent,
            topColor: CHART_COLORS.accentArea,
            bottomColor: "transparent",
            lineWidth: 2,
            priceLineVisible: true,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
        });

        chartRef.current = chart;
        areaSeriesRef.current = areaSeries;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                chart.applyOptions({
                    width: entry.contentRect.width,
                    height,
                });
            }
        });

        ro.observe(chartContainerRef.current);

        return () => {
            abortRef.current?.abort();
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            areaSeriesRef.current = null;
        };
    }, [height]);

    useEffect(() => {
        const areaSeries = areaSeriesRef.current;
        const chart = chartRef.current;
        if (!areaSeries || !chart || series.length === 0) return;

        const areaData: AreaData<Time>[] = series.map((p) => ({
            time: p.time as Time,
            value: p.value,
        }));

        areaSeries.setData(areaData);
        chart.timeScale().fitContent();
    }, [series]);

    const hasData = series.length > 0 && !error;
    const trendClassName =
        stats?.trend === "up"
            ? "chart-stat-positive"
            : stats?.trend === "down"
              ? "chart-stat-negative"
              : "chart-stat-neutral";

    return (
        <div className="chart-container" style={{ minHeight: height }}>
            <div className="chart-toolbar chart-toolbar-expanded">
                <div className="chart-toolbar-top">
                    <div className="chart-heading">
                        <div className="chart-heading-title-row">
                            <span className="chart-heading-title">CS2 Market Cap</span>
                            <span className="chart-heading-badge">1D</span>
                        </div>
                        <span className="chart-heading-subtitle">
                            Daily estimated market capitalization
                        </span>
                    </div>

                    <div className="chart-header-metrics">
                        <span className="chart-price-value">
                            {stats ? formatMarketCap(stats.currentValue) : "—"}
                        </span>
                        <span className="chart-heading-subtitle">
                            {latestTimestamp
                                ? new Date(latestTimestamp).toLocaleString()
                                : "Waiting for data"}
                        </span>
                    </div>
                </div>

                <div className="chart-toolbar-row">
                    <div className="chart-toolbar-group">
                        <span className="chart-heading-badge">Daily interval</span>
                    </div>

                    <div className="chart-toolbar-group chart-toolbar-group-actions">
                        <button
                            type="button"
                            className="chart-ghost-btn"
                            onClick={() => chartRef.current?.timeScale().fitContent()}
                        >
                            Reset view
                        </button>
                        <button
                            type="button"
                            className="chart-ghost-btn"
                            onClick={() => void fetchData(true)}
                        >
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            {stats && hasData && (
                <div className="chart-summary-grid">
                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Change</span>
                        <span className={`chart-summary-value ${trendClassName}`}>
                            {formatPercent(stats.changePercent)}
                        </span>
                        <span className={`chart-summary-meta ${trendClassName}`}>
                            {formatSignedMarketCap(stats.delta)}
                        </span>
                    </div>

                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Range</span>
                        <span className="chart-summary-value">{formatMarketCap(stats.low)}</span>
                        <span className="chart-summary-meta">
                            to {formatMarketCap(stats.high)}
                        </span>
                    </div>

                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Data Points</span>
                        <span className="chart-summary-value">{stats.dataPoints}</span>
                        <span className="chart-summary-meta">Daily snapshots</span>
                    </div>
                </div>
            )}

            {loading && series.length === 0 && (
                <div className="chart-state chart-state-loading" style={{ minHeight: height - 80 }}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ animation: "spin 1s linear infinite" }}
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Loading market cap history…</span>
                </div>
            )}

            {error && !loading && (
                <div className="chart-state" style={{ minHeight: height - 80 }}>
                    <span className="chart-state-error">{error}</span>
                    <button type="button" className="chart-ghost-btn" onClick={() => void fetchData(true)}>
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && series.length === 0 && (
                <div className="chart-state" style={{ minHeight: height - 80 }}>
                    <span>No market cap history available yet.</span>
                    <span className="chart-heading-subtitle">
                        Data is recorded daily. Check back after the next sync.
                    </span>
                </div>
            )}

            <div
                ref={chartContainerRef}
                className="chart-canvas"
                role="img"
                aria-label="Market cap history chart"
                style={{ display: hasData ? "block" : "none", height }}
            />

            {hasData && (
                <div className="chart-meta-bar">
                    <div className="chart-meta-left">
                        <span className="chart-meta-pill">{series.length} points</span>
                        <span className="chart-meta-pill">Source: CSGOTrader CSFloat</span>
                        <span className="chart-meta-pill">View: Area</span>
                    </div>
                </div>
            )}

            <div className="chart-attribution">
                <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
                    <svg width="24" height="13" viewBox="0 0 36 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M14 0H22V4H18V18H14V0Z" fill="currentColor" />
                        <path d="M24 0H26L32 18H28L24 0Z" fill="currentColor" />
                        <path d="M36 0H32L28 18H32L36 0Z" fill="currentColor" />
                        <path fillRule="evenodd" clipRule="evenodd" d="M0 0H12V4H8V8H12V12H8V18H4V12H0V8H4V4H0V0Z" fill="currentColor" />
                    </svg>
                    <span>TradingView</span>
                </a>
            </div>
        </div>
    );
}
