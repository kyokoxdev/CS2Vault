import styles from "@/app/startup/Landing.module.css";
import SteamLoginButton from "./SteamLoginButton";

interface HeroStat {
    value: number;
    prefix?: string;
    suffix?: string;
    label: string;
}

const HERO_STATS: HeroStat[] = [
    { value: 2.5, prefix: "$", suffix: "B", label: "Total market tracked" },
    { value: 50, suffix: "K+", label: "Items monitored" },
    { value: 24, suffix: "/7", label: "Real-time updates" },
];

export default function HeroSection() {
    function formatStatValue(stat: HeroStat): string {
        const value = Number.isInteger(stat.value)
            ? stat.value.toLocaleString("en-US")
            : stat.value.toString();

        return `${stat.prefix ?? ""}${value}${stat.suffix ?? ""}`;
    }

    return (
        <section className={styles.heroSection} data-testid="hero-section">
            <div className={styles.heroSectionContent}>
                <h1 className={styles.heroSectionTitle}>
                    Your CS2 Market
                    <br />
                    <span className={styles.heroSectionTitleAccent}>Intelligence Hub</span>
                </h1>

                <div className={styles.heroSectionStats} data-testid="hero-stats">
                    {HERO_STATS.map((stat) => (
                        <div key={stat.label} className={styles.heroSectionStatItem}>
                            <span className={styles.heroSectionStatValue}>{formatStatValue(stat)}</span>
                            <span className={styles.heroSectionStatLabel}>{stat.label}</span>
                        </div>
                    ))}
                </div>

                <p className={styles.heroSectionSubtitle}>
                    Stop guessing. Start knowing exactly what your skins are worth and when to trade them.
                </p>

                <div className={styles.heroSectionCta} data-testid="hero-cta">
                    <SteamLoginButton />
                </div>
            </div>

            <div className={styles.scrollIndicator} aria-hidden="true">
                <span className={styles.scrollChevron}>↓</span>
            </div>
        </section>
    );
}
