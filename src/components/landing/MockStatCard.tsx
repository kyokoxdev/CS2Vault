"use client";

import styles from "./MockStatCard.module.css";

interface MockStatCardProps {
    label: string;
    value: string;
    trend: "up" | "down";
    className?: string;
}

export default function MockStatCard({ label, value, trend, className }: MockStatCardProps) {
    return (
        <div className={`${styles.card} ${className ?? ""}`} data-testid="mock-stat-card">
            <div className={styles.label}>{label}</div>
            <div className={styles.value}>{value}</div>
            <div className={`${styles.trend} ${trend === "up" ? styles.trendUp : styles.trendDown}`}>
                {trend === "up" ? "▲" : "▼"} {trend === "up" ? "+3.2%" : "-1.5%"}
            </div>
        </div>
    );
}
