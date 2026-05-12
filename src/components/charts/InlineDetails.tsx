import styles from "./InlineDetails.module.css";

import type { ChartStats } from "./chart-utils";

interface InlineDetailsProps {
    stats: ChartStats | null;
    chartMode: "candles" | "line";
    trendClassName?: string;
}

function formatPrice(value: number | null): string {
    if (value === null || Number.isNaN(value)) {
        return "$0.00";
    }

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatPercent(value: number): string {
    const formatted = value.toFixed(2);
    return `${value > 0 ? "+" : ""}${formatted}%`;
}

export function InlineDetails({ stats, chartMode, trendClassName }: InlineDetailsProps) {
    if (!stats) {
        return null;
    }

    return (
        <div className={styles.inlineDetails}>
            <div className={styles.item}>
                <span className={styles.label}>Change</span>
                <span className={`${styles.value} ${trendClassName ?? ""}`.trim()}>
                    {formatPercent(stats.changePercent)}
                </span>
                <span className={`${styles.meta} ${trendClassName ?? ""}`.trim()}>
                    {stats.delta > 0 ? "+" : ""}
                    {formatPrice(stats.delta)}
                </span>
            </div>

            <div className={styles.item}>
                <span className={styles.label}>Range</span>
                <span className={styles.value}>{formatPrice(stats.low)}</span>
                <span className={styles.meta}>to {formatPrice(stats.high)}</span>
            </div>

            <div className={styles.item}>
                <span className={styles.label}>Candles</span>
                <span className={styles.value}>{stats.candleCount}</span>
                <span className={styles.meta}>{chartMode === "candles" ? "OHLC" : "Close line"} view</span>
            </div>
        </div>
    );
}
