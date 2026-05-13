"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AreaSeries,
    ColorType,
    LineSeries,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type AreaData,
    type LineData,
    type Time,
} from "lightweight-charts";
import { ChartModeToggle } from "./ChartModeToggle";
import { IndicatorPanel } from "./IndicatorPanel";
import { MarketCapInlineDetails } from "./MarketCapInlineDetails";
import { calculateIndicator, type IndicatorDataPoint } from "@/lib/indicators/indicator-service";
import { indicatorRegistry, type IndicatorRegistryEntry } from "@/lib/indicators/indicator-registry";

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
    highTime: number;
    low: number;
    dataPoints: number;
    trend: "up" | "down" | "flat";
}

interface MarketCapChartProps {
    height?: number;
}

interface IndicatorSeriesEntry {
    id: string;
    series: ISeriesApi<"Line">[];
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

const MARKET_CAP_OVERLAY_INDICATOR_IDS = ["sma", "ema", "bollinger"];

function toIndicatorLineSeriesData(points: IndicatorDataPoint[], valueIndex = 0): LineData<Time>[] {
    return points
        .map((point) => {
            const value = point.value ?? point.values?.[valueIndex];

            if (value === undefined || !Number.isFinite(value)) {
                return null;
            }

            return {
                time: point.time as Time,
                value,
            };
        })
        .filter((point): point is LineData<Time> => point !== null);
}

function getIndicatorSeriesCount(points: IndicatorDataPoint[]): number {
    return Math.max(
        1,
        ...points.map((point) => point.values?.length ?? (point.value === undefined ? 0 : 1))
    );
}

function getActiveIndicatorEntries(activeIndicators: string[]): IndicatorRegistryEntry[] {
    return activeIndicators
        .map((id) => indicatorRegistry.find((entry) => entry.id === id))
        .filter((entry): entry is IndicatorRegistryEntry => (
            entry !== undefined
            && entry.category === "overlay"
            && MARKET_CAP_OVERLAY_INDICATOR_IDS.includes(entry.id)
        ));
}

function removeIndicatorSeries(chart: IChartApi | null, entries: IndicatorSeriesEntry[]) {
    if (!chart || typeof chart.removeSeries !== "function") {
        return;
    }

    for (const entry of entries) {
        for (const series of entry.series) {
            chart.removeSeries(series);
        }
    }
}

function toMarketCapIndicatorCandles(series: MarketCapDataPoint[]) {
    return series.map((point) => ({
        time: point.time,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
        volume: 0,
    }));
}

function calculateBollingerBands(series: MarketCapDataPoint[], inputs?: Record<string, number>): IndicatorDataPoint[] {
    const length = inputs?.length ?? 20;
    const stdDev = inputs?.stdDev ?? 2;

    if (series.length < length) {
        return [];
    }

    const points: IndicatorDataPoint[] = [];

    for (let index = length - 1; index < series.length; index += 1) {
        const window = series.slice(index - length + 1, index + 1);
        const mean = window.reduce((sum, point) => sum + point.value, 0) / length;
        const variance = window.reduce((sum, point) => sum + (point.value - mean) ** 2, 0) / length;
        const bandWidth = Math.sqrt(variance) * stdDev;

        points.push({
            time: series[index].time,
            values: [mean + bandWidth, mean, mean - bandWidth],
        });
    }

    return points;
}

function calculateMarketCapIndicator(
    indicatorId: string,
    series: MarketCapDataPoint[],
    inputs?: Record<string, number>
): IndicatorDataPoint[] {
    const points = calculateIndicator(indicatorId, toMarketCapIndicatorCandles(series), inputs);

    if (points.length > 0 || indicatorId !== "bollinger") {
        return points;
    }

    return calculateBollingerBands(series, inputs);
}

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

function calculateStats(series: MarketCapDataPoint[]): MarketCapStats | null {
    if (series.length === 0) return null;

    let high = Number.NEGATIVE_INFINITY;
    let highTime = 0;
    let low = Number.POSITIVE_INFINITY;

    for (const point of series) {
        if (point.value > high) {
            high = point.value;
            highTime = point.time;
        }
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
        highTime,
        low,
        dataPoints: series.length,
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    };
}



export default function MarketCapChart({ height = 400 }: MarketCapChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const indicatorSeriesRef = useRef<IndicatorSeriesEntry[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    const [series, setSeries] = useState<MarketCapDataPoint[]>([]);
    const [stats, setStats] = useState<MarketCapStats | null>(null);
    const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);
    const [chartMode, setChartMode] = useState<"regular" | "advanced">("regular");
    const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
    const [indicatorInputs, setIndicatorInputs] = useState<Record<string, Record<string, number>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const handleIndicatorToggle = useCallback((indicatorId: string) => {
        if (!MARKET_CAP_OVERLAY_INDICATOR_IDS.includes(indicatorId)) {
            return;
        }

        setActiveIndicators((prev) =>
            prev.includes(indicatorId)
                ? prev.filter((id) => id !== indicatorId)
                : [...prev, indicatorId]
        );
    }, []);

    const handleIndicatorInputChange = useCallback((indicatorId: string, key: string, value: number) => {
        if (!Number.isFinite(value) || !MARKET_CAP_OVERLAY_INDICATOR_IDS.includes(indicatorId)) {
            return;
        }

        setIndicatorInputs((prev) => ({
            ...prev,
            [indicatorId]: { ...prev[indicatorId], [key]: value },
        }));
    }, []);

    const fetchData = useCallback(async (force = false) => {
        if (!force) setLoading(true);
        setError(null);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/market/market-cap/history?limit=1500", {
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
            indicatorSeriesRef.current = [];
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

    useEffect(() => {
        const chart = chartRef.current;

        removeIndicatorSeries(chart, indicatorSeriesRef.current);
        indicatorSeriesRef.current = [];

        if (!chart || chartMode !== "advanced" || series.length === 0) {
            return;
        }

        const overlayIndicators = getActiveIndicatorEntries(activeIndicators);

        for (const indicator of overlayIndicators) {
            const points = calculateMarketCapIndicator(indicator.id, series, indicatorInputs[indicator.id]);
            const seriesCount = getIndicatorSeriesCount(points);
            const seriesList: ISeriesApi<"Line">[] = [];

            for (let index = 0; index < seriesCount; index += 1) {
                const lineSeries = chart.addSeries(LineSeries, {
                    color: indicator.colors[index] ?? indicator.colors[0] ?? CHART_COLORS.accent,
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                    visible: points.length > 0,
                });

                lineSeries.setData(toIndicatorLineSeriesData(points, index));
                lineSeries.applyOptions({ visible: points.length > 0 });
                seriesList.push(lineSeries);
            }

            indicatorSeriesRef.current.push({ id: indicator.id, series: seriesList });
        }

        chart.timeScale().fitContent();

        return () => {
            removeIndicatorSeries(chart, indicatorSeriesRef.current);
            indicatorSeriesRef.current = [];
        };
    }, [activeIndicators, chartMode, indicatorInputs, series]);

    const hasData = series.length > 0 && !error;
    const trendClassName =
        stats?.trend === "up"
            ? "chart-stat-positive"
            : stats?.trend === "down"
              ? "chart-stat-negative"
              : "chart-stat-neutral";

    return (
        <div className="chart-container" style={{ minHeight: height }}>
            {chartMode === "regular" ? (
                <div className="chart-toolbar">
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

<MarketCapInlineDetails
                            stats={stats}
                            trendClassName={trendClassName}
                        />

                        <div className="chart-toolbar-group chart-toolbar-group-actions">
                            <button
                                type="button"
                                className="chart-ghost-btn btn-sm"
                                onClick={() => chartRef.current?.timeScale().fitContent()}
                                aria-label="Reset chart view"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                        d="M4 4v6h6"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M4.5 10a7.5 7.5 0 1 0 2.2-5.3"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className="chart-ghost-btn btn-sm"
                                onClick={() => void fetchData(true)}
                                aria-label="Refresh chart data"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                        d="M20 6v5h-5"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M20 11.5A8.5 8.5 0 1 0 6.2 18"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>

                            <ChartModeToggle mode={chartMode} onModeChange={setChartMode} />
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="chart-toolbar chart-toolbar-expanded chart-toolbar-advanced">
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

                                <ChartModeToggle mode={chartMode} onModeChange={setChartMode} />
                            </div>
                        </div>

                        <IndicatorPanel
                            activeIndicators={activeIndicators}
                            onToggle={handleIndicatorToggle}
                            onInputChange={handleIndicatorInputChange}
                            allowedIndicatorIds={MARKET_CAP_OVERLAY_INDICATOR_IDS}
                            compact
                        />
                    </div>
                </>
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
                style={{
                    visibility: hasData ? "visible" : "hidden",
                    height: hasData ? height : 0,
                    overflow: "hidden",
                }}
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
