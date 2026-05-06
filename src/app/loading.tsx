"use client";

import styles from "./Loading.module.css";
import { StaggerList, FadeIn } from "@/components/ui/Motion";
import { motion } from "framer-motion";

const STAT_KEYS = ["stat-cap", "stat-watchlist", "stat-portfolio", "stat-sync"];
const MOVER_KEYS = ["movers-gainers", "movers-losers"];
const CARD_KEYS = ["c1", "c2", "c3", "c4", "c5"];
const FEED_KEYS = ["feed-a", "feed-b", "feed-c", "feed-d", "feed-e"];

export default function Loading() {
  return (
    <FadeIn duration={0.4} className={styles.page}>
      <div className={styles.statsRow}>
        <StaggerList staggerDelay={0.05} keys={STAT_KEYS}>
          {STAT_KEYS.map((key) => (
            <div key={key} className={styles.statSkeleton}>
              <motion.div 
                className={styles.skeletonLabel} 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className={styles.skeletonValue} 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
              />
            </div>
          ))}
        </StaggerList>
      </div>

      <div className={styles.moversRow}>
        <StaggerList staggerDelay={0.1} keys={MOVER_KEYS}>
          {MOVER_KEYS.map((sectionKey) => (
            <div key={sectionKey} className={styles.moverSection}>
              <motion.div 
                className={styles.skeletonLabel}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                style={{ marginBottom: "16px" }}
              />
              <StaggerList staggerDelay={0.05} keys={CARD_KEYS}>
                {CARD_KEYS.map((cardKey) => (
                  <motion.div 
                    key={`${sectionKey}-${cardKey}`} 
                    className={styles.cardSkeleton} 
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}
              </StaggerList>
            </div>
          ))}
        </StaggerList>
      </div>

      <div className={styles.feedSection}>
        <motion.div 
          className={styles.skeletonLabel}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ marginBottom: "16px" }}
        />
        <StaggerList staggerDelay={0.05} keys={FEED_KEYS}>
          {FEED_KEYS.map((key) => (
            <motion.div 
              key={key} 
              className={styles.feedSkeleton} 
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </StaggerList>
      </div>
    </FadeIn>
  );
}
