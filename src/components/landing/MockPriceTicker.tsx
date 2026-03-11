"use client";

import styles from "./MockPriceTicker.module.css";

const TICKER_ITEMS = [
    { name: "AK-47 | Redline", price: "$12.50", trend: "up" as const },
    { name: "AWP | Asiimov", price: "$45.20", trend: "down" as const },
    { name: "M4A4 | Howl", price: "$1,890.00", trend: "up" as const },
    { name: "Karambit | Fade", price: "$1,245.00", trend: "up" as const },
    { name: "Glock-18 | Fade", price: "$420.00", trend: "down" as const },
    { name: "Desert Eagle | Blaze", price: "$320.00", trend: "up" as const },
    { name: "USP-S | Kill Confirmed", price: "$28.50", trend: "up" as const },
    { name: "Butterfly Knife | Doppler", price: "$985.00", trend: "down" as const },
];

export default function MockPriceTicker() {
    return (
        <div className={styles.tickerContainer} data-testid="mock-price-ticker">
            <div className={styles.tickerTrack}>
                {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                    <span key={`${item.name}-${i}`} className={styles.tickerItem}>
                        <span className={styles.itemName}>{item.name}</span>
                        <span className={styles.itemPrice}>{item.price}</span>
                        <span className={item.trend === "up" ? styles.trendUp : styles.trendDown}>
                            {item.trend === "up" ? "▲" : "▼"}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}
