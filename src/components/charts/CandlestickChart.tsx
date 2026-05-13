"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    CandlestickSeries,
    ColorType,
    HistogramSeries,
    LineSeries,
    createChart,
    type CandlestickData,
    type HistogramData,
    type IChartApi,
    type ISeriesApi,
    type LineData,
    type Time,
} from "lightweight-charts";
import {
    calculateChartStats,
    toLineSeriesData,
    type ChartCandlePoint,
    type ChartStats,
} from "./chart-utils";
import { ChartModeToggle } from "./ChartModeToggle";
import { InlineDetails } from "./InlineDetails";
import { IndicatorPanel } from "./IndicatorPanel";
import { TimeframeDropdown } from "./TimeframeDropdown";
import { useIsSmallMobile } from "@/hooks/useMediaQuery";
import { calculateIndicator, type IndicatorDataPoint } from "@/lib/indicators/indicator-service";
import { indicatorRegistry, type IndicatorRegistryEntry } from "@/lib/indicators/indicator-registry";
import { calculateLiquidityScore, type LiquidityScoreResult } from "@/lib/market/liquidity-score";

const TIMEFRAMES = [
    { label: "15M", value: "15m", limit: 192, description: "Short-range structure" },
    { label: "1H", value: "1h", limit: 240, description: "Trend over days" },
    { label: "4H", value: "4h", limit: 180, description: "Swing perspective" },
    { label: "1D", value: "1d", limit: 180, description: "Mid-term view" },
    { label: "1W", value: "1w", limit: 156, description: "Long-term context" },
] as const;

type TimeframeValue = (typeof TIMEFRAMES)[number]["value"];
type ChartMode = "candles" | "line";
type ViewMode = "regular" | "advanced";

const TIMEFRAME_OPTIONS = TIMEFRAMES.map(({ label, value, description }) => ({ label, value, description }));

interface PricesApiResponse {
    success: boolean;
    data?: {
        candlesticks: ChartCandlePoint[];
        latestPrice: number | null;
        latestTimestamp: string | null;
        latestSource?: string | null;
    };
    error?: string;
}

interface ChartDataset {
    interval: TimeframeValue;
    candles: ChartCandlePoint[];
    candlestickData: CandlestickData<Time>[];
    lineData: LineData<Time>[];
    stats: ChartStats | null;
    latestPrice: number | null;
    latestTimestamp: string | null;
    latestSource: string | null;
}

interface MarketSnapshot {
    price: number | null;
    timestamp: string | null;
    source: string | null;
    interval: TimeframeValue;
    liquidityScore: LiquidityScoreResult | null;
}

interface CandlestickChartProps {
    itemId: string;
    itemName?: string;
    height?: number;
    onMarketSnapshotChange?: (snapshot: MarketSnapshot) => void;
}

const CHART_COLORS = {
    bull: "#00C076",
    bear: "#FF4D4F",
    accent: "#3B82F6",
    amber: "#F5A524",
    violet: "#8B5CF6",
    text: "#8C8C8C",
    surface: "#141414",
    grid: "#1A1A1A",
    border: "#262626",
    crosshair: "rgba(140, 140, 140, 0.3)",
};

interface IndicatorSeriesEntry {
    id: string;
    series: ISeriesApi<"Line">[];
}

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

function toVolumeSeriesData(candles: ChartCandlePoint[]): HistogramData<Time>[] {
    return candles.map((candle) => ({
        time: candle.time as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(0, 192, 118, 0.35)" : "rgba(255, 77, 79, 0.35)",
    }));
}

function getIndicatorSeriesCount(points: IndicatorDataPoint[]): number {
    return Math.max(
        1,
        ...points.map((point) => point.values?.length ?? (point.value === undefined ? 0 : 1))
    );
}

function getActiveIndicatorEntries(activeIndicators: string[], category: IndicatorRegistryEntry["category"]): IndicatorRegistryEntry[] {
    return activeIndicators
        .map((indicatorId) => indicatorRegistry.find((indicator) => indicator.id === indicatorId))
        .filter((indicator): indicator is IndicatorRegistryEntry => Boolean(indicator && indicator.category === category));
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

function getTimeframeConfig(timeframe: TimeframeValue) {
    return TIMEFRAMES.find((candidate) => candidate.value === timeframe) ?? TIMEFRAMES[0];
}

function formatPrice(value: number | null): string {
    if (value === null) {
        return "—";
    }

    return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatTimestamp(value: string | null): string {
    if (!value) {
        return "Waiting for market data";
    }

    return new Date(value).toLocaleString();
}

function buildDataset(
    interval: TimeframeValue,
    candles: ChartCandlePoint[],
    latestPrice: number | null,
    latestTimestamp: string | null,
    latestSource: string | null
): ChartDataset {
    const candlestickData: CandlestickData<Time>[] = candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
    }));

    const lineData: LineData<Time>[] = toLineSeriesData(candles).map((point) => ({
        time: point.time as Time,
        value: point.value,
    }));

    return {
        interval,
        candles,
        candlestickData,
        lineData,
        stats: calculateChartStats(candles),
        latestPrice,
        latestTimestamp,
        latestSource,
    };
}

export default function CandlestickChart({
    itemId,
    itemName,
    height = 400,
    onMarketSnapshotChange,
}: CandlestickChartProps) {
    const isSmallMobile = useIsSmallMobile();
    const responsiveHeight = isSmallMobile ? 300 : height;

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const oscillatorContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const oscillatorChartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const indicatorSeriesRef = useRef<IndicatorSeriesEntry[]>([]);
    const oscillatorSeriesRef = useRef<IndicatorSeriesEntry[]>([]);
    const cacheRef = useRef<Map<TimeframeValue, ChartDataset>>(new Map());
    const abortRef = useRef<AbortController | null>(null);
    const marketSnapshotChangeRef = useRef(onMarketSnapshotChange);
    const previousItemIdRef = useRef(itemId);

    const [timeframe, setTimeframe] = useState<TimeframeValue>("1d");
    const [chartMode, setChartMode] = useState<ChartMode>("candles");
    const [viewMode, setViewMode] = useState<ViewMode>("regular");
    const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
    const [indicatorInputs, setIndicatorInputs] = useState<Record<string, Record<string, number>>>({});
    const [dataset, setDataset] = useState<ChartDataset | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isEmpty, setIsEmpty] = useState(false);

    useEffect(() => {
        marketSnapshotChangeRef.current = onMarketSnapshotChange;
    }, [onMarketSnapshotChange]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const publishSnapshot = useCallback(
        (nextDataset: ChartDataset | null, nextInterval: TimeframeValue) => {
            marketSnapshotChangeRef.current?.({
                price: nextDataset?.latestPrice ?? null,
                timestamp: nextDataset?.latestTimestamp ?? null,
                source: nextDataset?.latestSource ?? null,
                interval: nextInterval,
                liquidityScore: nextDataset ? calculateLiquidityScore(nextDataset.candles) : null,
            });
        },
        []
    );

    const fetchData = useCallback(
        async (nextTimeframe: TimeframeValue, force = false) => {
            const cachedDataset = cacheRef.current.get(nextTimeframe) ?? null;

            if (cachedDataset && !force) {
                setDataset(cachedDataset);
                setError(null);
                setNotice(null);
                setIsEmpty(cachedDataset.candles.length === 0);
                setLoading(false);
                setRefreshing(false);
                publishSnapshot(cachedDataset, nextTimeframe);
                return;
            }

            setError(null);
            setNotice(null);
            setIsEmpty(false);
            setLoading(!cachedDataset);
            setRefreshing(Boolean(cachedDataset));

            if (!cachedDataset) {
                setDataset(null);
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const timeframeConfig = getTimeframeConfig(nextTimeframe);
                const res = await fetch(
                    `/api/items/${itemId}/prices?interval=${nextTimeframe}&limit=${timeframeConfig.limit}`,
                    { signal: controller.signal }
                );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const json = (await res.json()) as PricesApiResponse;

                if (!json.success || !json.data) {
                    throw new Error(json.error ?? "API returned unsuccessful response");
                }

                const nextDataset = buildDataset(
                    nextTimeframe,
                    json.data.candlesticks,
                    json.data.latestPrice,
                    json.data.latestTimestamp,
                    json.data.latestSource ?? null
                );

                cacheRef.current.set(nextTimeframe, nextDataset);

                if (controller.signal.aborted) {
                    return;
                }

                setDataset(nextDataset);
                setIsEmpty(nextDataset.candles.length === 0);
                setNotice(force ? "Chart refreshed with latest market data." : null);
                publishSnapshot(nextDataset, nextTimeframe);
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }

                console.error("[Chart] Fetch failed:", err);

                if (cachedDataset) {
                    setDataset(cachedDataset);
                    setIsEmpty(cachedDataset.candles.length === 0);
                    setNotice("Could not refresh right now — showing cached chart data.");
                    publishSnapshot(cachedDataset, nextTimeframe);
                } else {
                    setError("Failed to load chart data");
                    publishSnapshot(null, nextTimeframe);
                }
            } finally {
                if (abortRef.current === controller) {
                    abortRef.current = null;
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [itemId, publishSnapshot]
    );

    useEffect(() => {
        if (previousItemIdRef.current === itemId) {
            return;
        }

        previousItemIdRef.current = itemId;
        abortRef.current?.abort();
        cacheRef.current.clear();
        setDataset(null);
        setTimeframe("1d");
        setChartMode("candles");
        setViewMode("regular");
        setActiveIndicators([]);
        setIndicatorInputs({});
        setLoading(true);
        setRefreshing(false);
        setError(null);
        setNotice(null);
        setIsEmpty(false);
        publishSnapshot(null, "1d");
    }, [itemId, publishSnapshot]);

    useEffect(() => {
        if (!chartContainerRef.current) {
            return;
        }

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: responsiveHeight,
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
                scaleMargins: { top: 0.08, bottom: 0.24 },
            },
            timeScale: {
                borderColor: CHART_COLORS.border,
                timeVisible: true,
            },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: CHART_COLORS.bull,
            downColor: CHART_COLORS.bear,
            borderUpColor: CHART_COLORS.bull,
            borderDownColor: CHART_COLORS.bear,
            wickUpColor: CHART_COLORS.bull,
            wickDownColor: CHART_COLORS.bear,
        });

        const lineSeries = chart.addSeries(LineSeries, {
            color: CHART_COLORS.accent,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            visible: false,
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: "rgba(140, 140, 140, 0.28)",
            priceFormat: { type: "volume" },
            priceScaleId: "volume",
            priceLineVisible: false,
            lastValueVisible: false,
        });

        chart.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.78, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        lineSeriesRef.current = lineSeries;
        volumeSeriesRef.current = volumeSeries;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                chart.applyOptions({
                    width: entry.contentRect.width,
                    height: responsiveHeight,
                });
            }
        });

        ro.observe(chartContainerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            lineSeriesRef.current = null;
            volumeSeriesRef.current = null;
            indicatorSeriesRef.current = [];
        };
    }, [responsiveHeight]);

    useEffect(() => {
        void fetchData(timeframe);
    }, [fetchData, timeframe]);

    const handleIndicatorToggle = useCallback((indicatorId: string) => {
        setActiveIndicators((current) =>
            current.includes(indicatorId)
                ? current.filter((id) => id !== indicatorId)
                : [...current, indicatorId]
        );
    }, []);

    const handleIndicatorInputChange = useCallback((indicatorId: string, key: string, value: number) => {
        if (!Number.isFinite(value)) {
            return;
        }

        setIndicatorInputs((current) => ({
            ...current,
            [indicatorId]: { ...current[indicatorId], [key]: value },
        }));
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        const candleSeries = candleSeriesRef.current;
        const lineSeries = lineSeriesRef.current;
        const volumeSeries = volumeSeriesRef.current;

        if (!chart || !candleSeries || !lineSeries || !volumeSeries) {
            return;
        }

        if (!dataset || dataset.candles.length === 0) {
            candleSeries.setData([]);
            lineSeries.setData([]);
            volumeSeries.setData([]);
            return;
        }

        candleSeries.setData(dataset.candlestickData);
        lineSeries.setData(dataset.lineData);
        volumeSeries.setData(toVolumeSeriesData(dataset.candles));

        candleSeries.applyOptions({ visible: chartMode === "candles" });
        lineSeries.applyOptions({ visible: chartMode === "line" });

        chart.priceScale("right").applyOptions({
            scaleMargins: { top: 0.08, bottom: 0.24 },
        });
        chart.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.78, bottom: 0 },
        });

        chart.timeScale().fitContent();

    }, [chartMode, dataset]);

    useEffect(() => {
        const chart = chartRef.current;
        const candles = dataset?.candles ?? [];

        removeIndicatorSeries(chart, indicatorSeriesRef.current);
        indicatorSeriesRef.current = [];

        if (!chart || viewMode !== "advanced" || candles.length === 0) {
            return;
        }

        const overlayIndicators = getActiveIndicatorEntries(activeIndicators, "overlay");

        for (const indicator of overlayIndicators) {
            const points = calculateIndicator(indicator.id, candles, indicatorInputs[indicator.id]);
            const seriesCount = getIndicatorSeriesCount(points);
            const seriesList: ISeriesApi<"Line">[] = [];

            for (let index = 0; index < seriesCount; index += 1) {
                const series = chart.addSeries(LineSeries, {
                    color: indicator.colors[index] ?? indicator.colors[0] ?? CHART_COLORS.accent,
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                    visible: points.length > 0,
                });

                series.setData(toIndicatorLineSeriesData(points, index));
                series.applyOptions({ visible: points.length > 0 });
                seriesList.push(series);
            }

            indicatorSeriesRef.current.push({ id: indicator.id, series: seriesList });
        }

        chart.timeScale().fitContent();

        return () => {
            removeIndicatorSeries(chart, indicatorSeriesRef.current);
            indicatorSeriesRef.current = [];
        };
    }, [activeIndicators, dataset, indicatorInputs, viewMode]);

    useEffect(() => {
        const container = oscillatorContainerRef.current;
        const candles = dataset?.candles ?? [];

        oscillatorChartRef.current?.remove();
        oscillatorChartRef.current = null;
        oscillatorSeriesRef.current = [];

        if (!container || viewMode !== "advanced" || candles.length === 0) {
            return;
        }

        const oscillatorIndicators = getActiveIndicatorEntries(activeIndicators, "oscillator");

        if (oscillatorIndicators.length === 0) {
            return;
        }

        const oscillatorChart = createChart(container, {
            width: container.clientWidth,
            height: 180,
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
            rightPriceScale: {
                borderColor: CHART_COLORS.border,
                scaleMargins: { top: 0.12, bottom: 0.12 },
            },
            timeScale: {
                borderColor: CHART_COLORS.border,
                timeVisible: true,
            },
        });

        oscillatorChartRef.current = oscillatorChart;

        for (const indicator of oscillatorIndicators) {
            const points = calculateIndicator(indicator.id, candles, indicatorInputs[indicator.id]);
            const seriesCount = getIndicatorSeriesCount(points);
            const seriesList: ISeriesApi<"Line">[] = [];

            for (let index = 0; index < seriesCount; index += 1) {
                const series = oscillatorChart.addSeries(LineSeries, {
                    color: indicator.colors[index] ?? indicator.colors[0] ?? CHART_COLORS.accent,
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                    visible: points.length > 0,
                });

                series.setData(toIndicatorLineSeriesData(points, index));
                series.applyOptions({ visible: points.length > 0 });
                seriesList.push(series);
            }

            oscillatorSeriesRef.current.push({ id: indicator.id, series: seriesList });
        }

        oscillatorChart.timeScale().fitContent();

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                oscillatorChart.applyOptions({ width: entry.contentRect.width, height: 180 });
            }
        });

        ro.observe(container);

        return () => {
            ro.disconnect();
            oscillatorChart.remove();
            if (oscillatorChartRef.current === oscillatorChart) {
                oscillatorChartRef.current = null;
                oscillatorSeriesRef.current = [];
            }
        };
    }, [activeIndicators, dataset, indicatorInputs, viewMode]);

    const timeframeConfig = getTimeframeConfig(timeframe);
    const stats = dataset?.stats ?? null;
    const hasChartData = Boolean(dataset && dataset.candles.length > 0 && !error);
    const hasActiveOscillators = getActiveIndicatorEntries(activeIndicators, "oscillator").length > 0;
    const trendClassName =
        stats?.trend === "up"
            ? "chart-stat-positive"
            : stats?.trend === "down"
              ? "chart-stat-negative"
              : "chart-stat-neutral";

    return (
        <div
            className="chart-container"
            style={{ minHeight: responsiveHeight }}
        >
            {viewMode === "regular" ? (
                <>
                    <div className="chart-toolbar">
                        <div className="chart-toolbar-top">
                            <div className="chart-heading">
                                <div className="chart-heading-title-row">
                                    {itemName && <span className="chart-heading-title">{itemName}</span>}
                                    <span className="chart-heading-badge">{timeframeConfig.label}</span>
                                </div>
                                <span className="chart-heading-subtitle">{timeframeConfig.description}</span>
                            </div>

                            <div className="chart-header-metrics">
                                <span className="chart-price-value">{formatPrice(dataset?.latestPrice ?? null)}</span>
                                <span className="chart-heading-subtitle">{formatTimestamp(dataset?.latestTimestamp ?? null)}</span>
                            </div>
                        </div>

                        <div className="chart-toolbar-row">
                            <div className="chart-toolbar-group">
                                <TimeframeDropdown
                                    value={timeframe}
                                    onChange={(value) => setTimeframe(value as TimeframeValue)}
                                    options={TIMEFRAME_OPTIONS}
                                />

                                <button
                                    type="button"
                                    className={`chart-toggle-btn ${chartMode === "candles" ? "active" : ""}`}
                                    aria-pressed={chartMode === "candles"}
                                    onClick={() => setChartMode("candles")}
                                >
                                    Candles
                                </button>
                                <button
                                    type="button"
                                    className={`chart-toggle-btn ${chartMode === "line" ? "active" : ""}`}
                                    aria-pressed={chartMode === "line"}
                                    onClick={() => setChartMode("line")}
                                >
                                    Line
                                </button>
                            </div>

                            <InlineDetails
                                stats={stats}
                                chartMode={chartMode}
                                trendClassName={trendClassName}
                            />

                            <div className="chart-toolbar-group chart-toolbar-group-actions">
                                <button
                                    type="button"
                                    className="chart-ghost-btn"
                                    onClick={() => chartRef.current?.timeScale().fitContent()}
                                    aria-label="Reset chart view"
                                >
                                    Reset
                                </button>
                                <button
                                    type="button"
                                    className="chart-ghost-btn"
                                    onClick={() => {
                                        cacheRef.current.delete(timeframe);
                                        void fetchData(timeframe, true);
                                    }}
                                    aria-label="Refresh chart data"
                                >
                                    Refresh
                                </button>

                                <ChartModeToggle
                                    mode={viewMode}
                                    onModeChange={setViewMode}
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="chart-toolbar chart-toolbar-expanded chart-toolbar-advanced">
                        <div className="chart-toolbar-top">
                            <div className="chart-heading">
                                <div className="chart-heading-title-row">
                                    {itemName && <span className="chart-heading-title">{itemName}</span>}
                                    <span className="chart-heading-badge">{timeframeConfig.label}</span>
                                </div>
                                <span className="chart-heading-subtitle">{timeframeConfig.description}</span>
                            </div>

                            <div className="chart-header-metrics">
                                <span className="chart-price-value">{formatPrice(dataset?.latestPrice ?? null)}</span>
                                <span className="chart-heading-subtitle">{formatTimestamp(dataset?.latestTimestamp ?? null)}</span>
                            </div>
                        </div>

                        <div className="chart-toolbar-row">
                            <div className="chart-toolbar-group">
                                {TIMEFRAMES.map((candidate) => (
                                    <button
                                        key={candidate.value}
                                        type="button"
                                        className={`timeframe-btn ${timeframe === candidate.value ? "active" : ""}`}
                                        aria-pressed={timeframe === candidate.value}
                                        onClick={() => setTimeframe(candidate.value)}
                                    >
                                        {candidate.label}
                                    </button>
                                ))}
                            </div>

                            <div className="chart-toolbar-group">
                                <button
                                    type="button"
                                    className={`chart-toggle-btn ${chartMode === "candles" ? "active" : ""}`}
                                    aria-pressed={chartMode === "candles"}
                                    onClick={() => setChartMode("candles")}
                                >
                                    Candles
                                </button>
                                <button
                                    type="button"
                                    className={`chart-toggle-btn ${chartMode === "line" ? "active" : ""}`}
                                    aria-pressed={chartMode === "line"}
                                    onClick={() => setChartMode("line")}
                                >
                                    Line
                                </button>
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
                                    onClick={() => {
                                        cacheRef.current.delete(timeframe);
                                        void fetchData(timeframe, true);
                                    }}
                                >
                                    Refresh
                                </button>

                                <ChartModeToggle
                                    mode={viewMode}
                                    onModeChange={setViewMode}
                                />
                            </div>
                        </div>

                        <IndicatorPanel
                            activeIndicators={activeIndicators}
                            onToggle={handleIndicatorToggle}
                            onInputChange={handleIndicatorInputChange}
                            compact
                        />
                    </div>
                </>
            )}

            {loading && !dataset && (
                <div className="chart-state chart-state-loading" style={{ minHeight: responsiveHeight - 80 }}>
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
                    <span>Loading chart…</span>
                </div>
            )}

            {error && !loading && (
                <div className="chart-state" style={{ minHeight: responsiveHeight - 80 }}>
                    <span className="chart-state-error">{error}</span>
                    <button type="button" className="chart-ghost-btn" onClick={() => void fetchData(timeframe, true)}>
                        Retry
                    </button>
                </div>
            )}

            {isEmpty && !loading && !error && (
                <div className="chart-state" style={{ minHeight: responsiveHeight - 80 }}>
                    <span>No price history available for this timeframe.</span>
                </div>
            )}

            <div
                ref={chartContainerRef}
                className="chart-canvas"
                role="img"
                aria-label={`Price chart for ${itemName ?? "item"}`}
                style={{
                    visibility: hasChartData ? "visible" : "hidden",
                    height: hasChartData ? responsiveHeight : 0,
                    overflow: "hidden",
                }}
            />

            {viewMode === "advanced" && hasActiveOscillators && hasChartData && (
                <div
                    ref={oscillatorContainerRef}
                    className="chart-canvas"
                    role="img"
                    aria-label={`Oscillator indicators for ${itemName ?? "item"}`}
                    style={{ height: 180, marginTop: 12, overflow: "hidden" }}
                />
            )}

            {(refreshing || notice || dataset) && (
                <div className="chart-meta-bar">
                    <div className="chart-meta-left">
                        <span className="chart-meta-pill">{dataset?.candles.length ?? 0} points</span>
                        {dataset?.latestSource && <span className="chart-meta-pill">Source: {dataset.latestSource}</span>}
                        <span className="chart-meta-pill">View: {chartMode === "candles" ? "Candlestick" : "Line"}</span>
                    </div>

                    <div className="chart-meta-right">
                        {refreshing && <span className="chart-status-text">Refreshing chart…</span>}
                        {notice && !refreshing && <span className="chart-status-text">{notice}</span>}
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
