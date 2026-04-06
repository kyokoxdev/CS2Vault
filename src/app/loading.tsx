import styles from "./Loading.module.css";

const STAT_KEYS = ["stat-cap", "stat-watchlist", "stat-portfolio", "stat-sync"];
const MOVER_KEYS = ["movers-gainers", "movers-losers"];
const CARD_KEYS = ["c1", "c2", "c3", "c4", "c5"];
const FEED_KEYS = ["feed-a", "feed-b", "feed-c", "feed-d", "feed-e"];

export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.statsRow}>
        {STAT_KEYS.map((key) => (
          <div key={key} className={styles.statSkeleton}>
            <div className={styles.skeletonLabel} />
            <div className={styles.skeletonValue} />
          </div>
        ))}
      </div>

      <div className={styles.moversRow}>
        {MOVER_KEYS.map((sectionKey) => (
          <div key={sectionKey} className={styles.moverSection}>
            <div className={styles.skeletonLabel} />
            {CARD_KEYS.map((cardKey) => (
              <div key={`${sectionKey}-${cardKey}`} className={styles.cardSkeleton} />
            ))}
          </div>
        ))}
      </div>

      <div className={styles.feedSection}>
        <div className={styles.skeletonLabel} />
        {FEED_KEYS.map((key) => (
          <div key={key} className={styles.feedSkeleton} />
        ))}
      </div>
    </div>
  );
}
