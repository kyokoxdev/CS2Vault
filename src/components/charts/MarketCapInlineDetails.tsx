import styles from "./InlineDetails.module.css";

interface MarketCapInlineDetailsProps {
    stats: {
        changePercent: number;
        delta: number;
        high: number;
        highTime: number;
        dataPoints: number;
        trend: "up" | "down" | "flat";
    } | null;
    trendClassName?: string;
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

export function MarketCapInlineDetails({ stats, trendClassName }: MarketCapInlineDetailsProps) {
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
                    {formatSignedMarketCap(stats.delta)}
                </span>
            </div>

            <div className={styles.item}>
                <span className={styles.label}>ATH</span>
                <span className={styles.value}>{formatMarketCap(stats.high)}</span>
                <span className={styles.meta}>
                    {stats.highTime
                        ? new Date(stats.highTime * 1000).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                        })
                        : "—"}
                </span>
            </div>

            <div className={styles.item}>
                <span className={styles.label}>Data Points</span>
                <span className={styles.value}>{stats.dataPoints}</span>
                <span className={styles.meta}>Daily snapshots</span>
            </div>
        </div>
    );
}