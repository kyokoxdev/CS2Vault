"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    CandlestickSeries,
    ColorType,
    LineSeries,
    createChart,
    type CandlestickData,
    type IChartApi,
    type ISeriesApi,
    type LineData,
    type Time,
} from "lightweight-charts";
import {
    calculateChartStats,
    calculateSimpleMovingAverage,
    toLineSeriesData,
    type ChartCandlePoint,
    type ChartStats,
} from "./chart-utils";

const TIMEFRAMES = [
    { label: "15M", value: "15m", limit: 192, description: "Short-range structure" },
    { label: "1H", value: "1h", limit: 240, description: "Trend over days" },
    { label: "4H", value: "4h", limit: 180, description: "Swing perspective" },
    { label: "1D", value: "1d", limit: 180, description: "Mid-term view" },
    { label: "1W", value: "1w", limit: 156, description: "Long-term context" },
] as const;

type TimeframeValue = (typeof TIMEFRAMES)[number]["value"];
type ChartMode = "candles" | "line";

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
    maShortData: LineData<Time>[];
    maLongData: LineData<Time>[];
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

function formatSignedPrice(value: number): string {
    const formatted = Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (value === 0) {
        return `$${formatted}`;
    }

    return `${value > 0 ? "+" : "-"}$${formatted}`;
}

function formatPercent(value: number): string {
    const formatted = Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (value === 0) {
        return `${formatted}%`;
    }

    return `${value > 0 ? "+" : "-"}${formatted}%`;
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

    const maShortData: LineData<Time>[] = calculateSimpleMovingAverage(candles, 7).map((point) => ({
        time: point.time as Time,
        value: point.value,
    }));

    const maLongData: LineData<Time>[] = calculateSimpleMovingAverage(candles, 21).map((point) => ({
        time: point.time as Time,
        value: point.value,
    }));

    return {
        interval,
        candles,
        candlestickData,
        lineData,
        maShortData,
        maLongData,
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
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const maShortSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const maLongSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const cacheRef = useRef<Map<TimeframeValue, ChartDataset>>(new Map());
    const abortRef = useRef<AbortController | null>(null);
    const marketSnapshotChangeRef = useRef(onMarketSnapshotChange);
    const previousItemIdRef = useRef(itemId);

    const [timeframe, setTimeframe] = useState<TimeframeValue>("1d");
    const [chartMode, setChartMode] = useState<ChartMode>("candles");
    const [showMA7, setShowMA7] = useState(true);
    const [showMA21, setShowMA21] = useState(false);
    const [dataset, setDataset] = useState<ChartDataset | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isEmpty, setIsEmpty] = useState(false);

    useEffect(() => {
        marketSnapshotChangeRef.current = onMarketSnapshotChange;
    }, [onMarketSnapshotChange]);

    const publishSnapshot = useCallback(
        (nextDataset: ChartDataset | null, nextInterval: TimeframeValue) => {
            marketSnapshotChangeRef.current?.({
                price: nextDataset?.latestPrice ?? null,
                timestamp: nextDataset?.latestTimestamp ?? null,
                source: nextDataset?.latestSource ?? null,
                interval: nextInterval,
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
        setShowMA7(true);
        setShowMA21(false);
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
                scaleMargins: { top: 0.08, bottom: 0.28 },
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

        const maShortSeries = chart.addSeries(LineSeries, {
            color: CHART_COLORS.amber,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        const maLongSeries = chart.addSeries(LineSeries, {
            color: CHART_COLORS.violet,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            visible: false,
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        lineSeriesRef.current = lineSeries;
        maShortSeriesRef.current = maShortSeries;
        maLongSeriesRef.current = maLongSeries;

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
            candleSeriesRef.current = null;
            lineSeriesRef.current = null;
            maShortSeriesRef.current = null;
            maLongSeriesRef.current = null;
        };
    }, [height]);

    useEffect(() => {
        void fetchData(timeframe);
    }, [fetchData, timeframe]);

    useEffect(() => {
        const chart = chartRef.current;
        const candleSeries = candleSeriesRef.current;
        const lineSeries = lineSeriesRef.current;
        const maShortSeries = maShortSeriesRef.current;
        const maLongSeries = maLongSeriesRef.current;

        if (!chart || !candleSeries || !lineSeries || !maShortSeries || !maLongSeries) {
            return;
        }

        if (!dataset || dataset.candles.length === 0) {
            candleSeries.setData([]);
            lineSeries.setData([]);
            maShortSeries.setData([]);
            maLongSeries.setData([]);
            return;
        }

        candleSeries.setData(dataset.candlestickData);
        lineSeries.setData(dataset.lineData);
        maShortSeries.setData(dataset.maShortData);
        maLongSeries.setData(dataset.maLongData);

        candleSeries.applyOptions({ visible: chartMode === "candles" });
        lineSeries.applyOptions({ visible: chartMode === "line" });
        maShortSeries.applyOptions({ visible: showMA7 && dataset.maShortData.length > 0 });
        maLongSeries.applyOptions({ visible: showMA21 && dataset.maLongData.length > 0 });

        chart.priceScale("right").applyOptions({
            scaleMargins: { top: 0.08, bottom: 0.08 },
        });

        chart.timeScale().fitContent();

    }, [chartMode, dataset, showMA21, showMA7]);

    const timeframeConfig = getTimeframeConfig(timeframe);
    const stats = dataset?.stats ?? null;
    const hasChartData = Boolean(dataset && dataset.candles.length > 0 && !error);
    const trendClassName =
        stats?.trend === "up"
            ? "chart-stat-positive"
            : stats?.trend === "down"
              ? "chart-stat-negative"
              : "chart-stat-neutral";

    return (
        <div
            className="chart-container"
            style={{ minHeight: height }}
        >
            <div className="chart-toolbar chart-toolbar-expanded">
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

                    <div className="chart-toolbar-group">
                        <button
                            type="button"
                            className={`chart-toggle-btn ${showMA7 ? "active" : ""}`}
                            aria-pressed={showMA7}
                            onClick={() => setShowMA7((current) => !current)}
                        >
                            MA 7
                        </button>
                        <button
                            type="button"
                            className={`chart-toggle-btn ${showMA21 ? "active" : ""}`}
                            aria-pressed={showMA21}
                            onClick={() => setShowMA21((current) => !current)}
                            disabled={!dataset || dataset.maLongData.length === 0}
                        >
                            MA 21
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
                    </div>
                </div>
            </div>

            {stats && hasChartData && (
                <div className="chart-summary-grid">
                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Change</span>
                        <span className={`chart-summary-value ${trendClassName}`}>{formatPercent(stats.changePercent)}</span>
                        <span className={`chart-summary-meta ${trendClassName}`}>{formatSignedPrice(stats.delta)}</span>
                    </div>

                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Range</span>
                        <span className="chart-summary-value">{formatPrice(stats.low)}</span>
                        <span className="chart-summary-meta">to {formatPrice(stats.high)}</span>
                    </div>

                    <div className="chart-summary-card">
                        <span className="chart-summary-label">Candles</span>
                        <span className="chart-summary-value">{stats.candleCount}</span>
                        <span className="chart-summary-meta">{chartMode === "candles" ? "OHLC" : "Close line"} view</span>
                    </div>
                </div>
            )}

            {loading && !dataset && (
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
                    <span>Loading chart…</span>
                </div>
            )}

            {error && !loading && (
                <div className="chart-state" style={{ minHeight: height - 80 }}>
                    <span className="chart-state-error">{error}</span>
                    <button type="button" className="chart-ghost-btn" onClick={() => void fetchData(timeframe, true)}>
                        Retry
                    </button>
                </div>
            )}

            {isEmpty && !loading && !error && (
                <div className="chart-state" style={{ minHeight: height - 80 }}>
                    <span>No price history available for this timeframe.</span>
                </div>
            )}

            <div
                ref={chartContainerRef}
                className="chart-canvas"
                role="img"
                aria-label={`Price chart for ${itemName ?? "item"}`}
                style={{ display: hasChartData ? "block" : "none", height }}
            />

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
