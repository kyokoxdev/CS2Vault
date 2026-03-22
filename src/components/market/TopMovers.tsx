"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import styles from "./TopMovers.module.css";
import SparklineChart from "@/components/charts/SparklineChart";
import { Badge } from "@/components/ui/Badge";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { FaChartLine } from "react-icons/fa";

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
  source?: 'pricempire' | 'watchlist';
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function TopMovers({ gainers, losers, isLoading = false, source }: TopMoversProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const handleItemClick = (id: string) => {
    router.push(`/item/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(id);
    }
  };

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

    const CardWrapper = reducedMotion ? 'button' : motion.button;
    const motionProps = reducedMotion ? {} : {
      variants: itemVariants,
      initial: "hidden",
      animate: "visible",
      transition: { delay: index * 0.05, duration: 0.2 },
      whileHover: { backgroundColor: "var(--surface-hover)" },
      whileTap: { scale: 0.99 },
    };

    return (
      <CardWrapper
        key={item.id}
        type="button"
        className={styles.card}
        onClick={() => handleItemClick(item.id)}
        onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => handleKeyDown(e, item.id)}
        {...motionProps}
      >
        <span className={styles.itemName} title={item.name}>{item.name}</span>
        <span className={styles.itemPrice}>
          ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <Badge variant={badgeVariant} size="sm">{changeText}</Badge>
        <SparklineChart 
          data={item.sparkline} 
          width={120} 
          height={32} 
          color={chartColor} 
        />
      </CardWrapper>
    );
  };

  const renderGainersContent = () => {
    if (isLoading) return renderSkeletons();
    if (gainers.length === 0) return renderEmptySection();
    return gainers.slice(0, 5).map((item, i) => renderCard(item, 'gainer', i));
  };

  const renderLosersContent = () => {
    if (isLoading) return renderSkeletons();
    if (losers.length === 0) return renderEmptySection();
    return losers.slice(0, 5).map((item, i) => renderCard(item, 'loser', i));
  };

  return (
    <>
      {source === 'watchlist' && (
        <div className={styles.fallbackNotice}>
          Live market data unavailable — showing watchlist items only
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Top Gainers</div>
          {renderGainersContent()}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Top Losers</div>
          {renderLosersContent()}
        </div>
      </div>
    </>
  );
}
