"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import styles from "./TopMovers.module.css";
import { Badge } from "@/components/ui/Badge";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { FaChartLine } from "react-icons/fa";

const SparklineChart = dynamic(
  () => import("@/components/charts/SparklineChart"),
  { ssr: false }
);

const MotionLink = motion(Link);

export interface TopMover {
  id: string;
  name: string;
  price: number;
  change24h: number;
  sparkline: { time: number; value: number }[];
}

interface TopMoversProps {
  gainers: TopMover[];
  losers: TopMover[];
  isLoading?: boolean;
  source?: string;
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function TopMovers({ gainers, losers, isLoading = false, source }: TopMoversProps) {
  const reducedMotion = useReducedMotion();
  const displayGainers = gainers.slice(0, 5);
  const displayLosers = losers.slice(0, 5);

  const renderSkeletons = () => (
    <>
      {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((key) => (
        <div key={key} className={styles.skeleton} />
      ))}
    </>
  );

  const renderEmptySection = () => (
    <div className={styles.sectionEmptyState}>
      <FaChartLine className={styles.emptyIcon} />
      <span>No significant movement</span>
    </div>
  );

  const renderCard = (item: TopMover, type: 'gainer' | 'loser', index: number) => {
    const isPositive = item.change24h > 0;
    const badgeVariant = isPositive ? "success" : "danger";
    const changeText = `${isPositive ? "+" : ""}${item.change24h.toFixed(2)}%`;
    const chartColor = type === 'gainer' ? "#00C076" : "#FF4D4F";
    const rankLabel = `${index + 1}`.padStart(2, "0");

    const motionProps = reducedMotion ? {} : {
      variants: itemVariants,
      initial: "hidden",
      animate: "visible",
      transition: { delay: index * 0.05, duration: 0.2 },
      whileHover: { backgroundColor: "var(--surface-hover)" },
      whileTap: { scale: 0.99 },
    };

    if (reducedMotion) {
      return (
        <Link
          key={item.id}
          href={`/item/${item.id}`}
          className={styles.card}
          data-testid={`top-mover-${type}-${item.id}`}
        >
          <span className={styles.rank}>{rankLabel}</span>
          <div className={styles.cardBody}>
            <div className={styles.cardHeading}>
              <span className={styles.itemName} title={item.name}>{item.name}</span>
              <Badge variant={badgeVariant} size="sm">{changeText}</Badge>
            </div>
            <div className={styles.cardFoot}>
              <span className={styles.itemPrice}>
                ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className={styles.sparklineWrap}>
                <SparklineChart
                  data={item.sparkline}
                  width={136}
                  height={40}
                  color={chartColor}
                />
              </div>
            </div>
          </div>
        </Link>
      );
    }

    return (
      <MotionLink
        key={item.id}
        href={`/item/${item.id}`}
        className={styles.card}
        data-testid={`top-mover-${type}-${item.id}`}
        {...motionProps}
      >
        <span className={styles.rank}>{rankLabel}</span>
        <div className={styles.cardBody}>
          <div className={styles.cardHeading}>
            <span className={styles.itemName} title={item.name}>{item.name}</span>
            <Badge variant={badgeVariant} size="sm">{changeText}</Badge>
          </div>
          <div className={styles.cardFoot}>
            <span className={styles.itemPrice}>
              ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className={styles.sparklineWrap}>
              <SparklineChart
                data={item.sparkline}
                width={136}
                height={40}
                color={chartColor}
              />
            </div>
          </div>
        </div>
      </MotionLink>
    );
  };

  const renderGainersContent = () => {
    if (isLoading) return renderSkeletons();
    if (gainers.length === 0) return renderEmptySection();
    return displayGainers.map((item, i) => renderCard(item, 'gainer', i));
  };

  const renderLosersContent = () => {
    if (isLoading) return renderSkeletons();
    if (losers.length === 0) return renderEmptySection();
    return displayLosers.map((item, i) => renderCard(item, 'loser', i));
  };

  return (
    <>
      {source === 'watchlist' && (
        <div className={styles.fallbackNotice}>
          Live market data unavailable — showing watchlist items only
        </div>
      )}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Top Movers</h2>
          <p className={styles.description}>Largest 24h price changes across tracked items.</p>
        </div>
        <div className={styles.summaryChips}>
          <span className={styles.summaryChip}>Gainers {displayGainers.length}</span>
          <span className={styles.summaryChip}>Losers {displayLosers.length}</span>
        </div>
      </div>
      <div className={styles.container} data-testid="top-movers-board">
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Top Gainers</div>
              <div className={styles.sectionSubtext}>Strongest gains over the last 24 hours</div>
            </div>
            <span className={`${styles.sectionAccent} ${styles.sectionAccentPositive}`}>Bull</span>
          </div>
          {renderGainersContent()}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Top Losers</div>
              <div className={styles.sectionSubtext}>Largest declines over the last 24 hours</div>
            </div>
            <span className={`${styles.sectionAccent} ${styles.sectionAccentNegative}`}>Bear</span>
          </div>
          {renderLosersContent()}
        </div>
      </div>
    </>
  );
}
