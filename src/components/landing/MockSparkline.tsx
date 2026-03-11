"use client";

import styles from "./MockSparkline.module.css";

interface MockSparklineProps {
    className?: string;
}

export default function MockSparkline({ className }: MockSparklineProps) {
    return (
        <div className={`${styles.sparklineContainer} ${className ?? ""}`} data-testid="mock-sparkline">
            <svg
                viewBox="0 0 200 60"
                className={styles.sparklineSvg}
                preserveAspectRatio="none"
                role="img"
                aria-label="Price sparkline chart"
            >
                <title>Price sparkline chart</title>
                <path
                    d="M0,45 L20,42 L40,38 L60,40 L80,30 L100,32 L120,25 L140,20 L160,22 L180,15 L200,10"
                    className={styles.sparklinePath}
                    fill="none"
                    strokeWidth="2"
                />
                <path
                    d="M0,45 L20,42 L40,38 L60,40 L80,30 L100,32 L120,25 L140,20 L160,22 L180,15 L200,10 L200,60 L0,60 Z"
                    className={styles.sparklineArea}
                />
            </svg>
        </div>
    );
}
