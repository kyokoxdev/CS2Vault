import SteamItemImage, { POPULAR_ITEMS } from "./SteamItemImage";
import MockSparkline from "./MockSparkline";
import styles from "./ItemShowcase.module.css";

interface ShowcaseItem {
    name: string;
    price: number;
    change: number;
    imageUrl: string;
}

const SHOWCASE_ITEMS: ShowcaseItem[] = [
    { name: "AK-47 | Redline", price: 12.50, change: +5.2, imageUrl: POPULAR_ITEMS.AK47_REDLINE },
    { name: "AWP | Asiimov", price: 45.20, change: -2.8, imageUrl: POPULAR_ITEMS.AWP_ASIIMOV },
    { name: "M4A4 | Howl", price: 1890.00, change: +12.4, imageUrl: POPULAR_ITEMS.M4A4_HOWL },
    { name: "Karambit | Fade", price: 1245.00, change: +3.7, imageUrl: POPULAR_ITEMS.KARAMBIT_FADE },
    { name: "Glock-18 | Fade", price: 420.00, change: -1.5, imageUrl: POPULAR_ITEMS.GLOCK_FADE },
    { name: "Desert Eagle | Blaze", price: 320.00, change: +8.9, imageUrl: POPULAR_ITEMS.DEAGLE_BLAZE },
    { name: "USP-S | Kill Confirmed", price: 28.50, change: +2.1, imageUrl: POPULAR_ITEMS.USPS_KILL_CONFIRMED },
    { name: "Butterfly | Doppler", price: 985.00, change: -4.3, imageUrl: POPULAR_ITEMS.BUTTERFLY_DOPPLER },
];

function formatPrice(price: number): string {
    return price >= 1000
        ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : `$${price.toFixed(2)}`;
}

function formatChange(change: number): string {
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(1)}%`;
}

export default function ItemShowcase() {
    return (
        <section className={styles.showcaseSection}>
            <div className={styles.showcaseContent} data-testid="item-showcase">
                <header className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>MARKET MOVERS</h2>
                    <div className={styles.titleUnderline} aria-hidden="true" />
                </header>

                <div className={styles.itemGrid}>
                    {SHOWCASE_ITEMS.map((item, index) => (
                        <article
                            key={item.name}
                            className={styles.itemCard}
                            data-testid="showcase-item-card"
                        >
                            <div className={styles.itemImageWrapper}>
                                <SteamItemImage
                                    imageUrl={item.imageUrl}
                                    alt={item.name}
                                    size="lg"
                                    className={styles.itemImage}
                                />
                                <div className={styles.itemOverlay} />
                            </div>

                            <div className={styles.itemInfo}>
                                <h3 className={styles.itemName}>{item.name}</h3>
                                
                                <div className={styles.itemMetrics}>
                                    <span className={styles.itemPrice}>
                                        {formatPrice(item.price)}
                                    </span>
                                    <span
                                        className={`${styles.itemChange} ${
                                            item.change >= 0 ? styles.positive : styles.negative
                                        }`}
                                    >
                                        {formatChange(item.change)}
                                    </span>
                                </div>

                                <div className={styles.sparklineWrapper}>
                                    <MockSparkline className={styles.itemSparkline} />
                                </div>
                            </div>

                            <div className={styles.cardBorder} aria-hidden="true" />
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
