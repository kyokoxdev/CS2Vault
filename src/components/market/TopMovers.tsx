"use client";

import { useRouter } from "next/navigation";
import styles from "./TopMovers.module.css";
import SparklineChart from "@/components/charts/SparklineChart";
import { Badge } from "@/components/ui/Badge";

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
}

export function TopMovers({ gainers, losers, isLoading = false }: TopMoversProps) {
  const router = useRouter();

  const handleItemClick = (id: string) => {
    router.push(`/item/${id}`);
  };

  const renderSkeletons = () => (
    <>
      {[...Array(5)].map((_, i) => (
        <div key={i} className={styles.skeleton} />
      ))}
    </>
  );

  const renderCard = (item: TopMover, type: 'gainer' | 'loser') => {
    const isPositive = item.change24h > 0;
    const badgeVariant = isPositive ? "success" : "danger";
    const changeText = `${isPositive ? "+" : ""}${item.change24h.toFixed(2)}%`;
    const chartColor = type === 'gainer' ? "var(--bull)" : "var(--bear)";

    return (
      <div 
        key={item.id} 
        className={styles.card}
        onClick={() => handleItemClick(item.id)}
      >
        <div className={styles.itemName} title={item.name}>{item.name}</div>
        <div className={styles.itemPrice}>
          ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <Badge variant={badgeVariant} size="sm">{changeText}</Badge>
        <SparklineChart 
          data={item.sparkline} 
          width={120} 
          height={32} 
          color={chartColor} 
        />
      </div>
    );
  };

  if (!isLoading && gainers.length === 0 && losers.length === 0) {
    return <div className={styles.emptyState}>No market data available</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Top Gainers</div>
        {isLoading ? renderSkeletons() : gainers.slice(0, 5).map(item => renderCard(item, 'gainer'))}
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Top Losers</div>
        {isLoading ? renderSkeletons() : losers.slice(0, 5).map(item => renderCard(item, 'loser'))}
      </div>
    </div>
  );
}
