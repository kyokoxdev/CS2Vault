"use client";

import Link from "next/link";
import { FaNewspaper, FaArrowUp, FaArrowDown } from "react-icons/fa";
import styles from "./NewsFeed.module.css";

export interface FeedItem {
  id: string;
  type: "news" | "price_alert";
  title: string;
  summary: string;
  timestamp: string;
  url?: string;
  source?: string;
  meta?: {
    itemName?: string;
    priceChange?: number;
    newPrice?: number;
    itemId?: string;
  };
}

interface NewsFeedProps {
  items: FeedItem[];
  isLoading?: boolean;
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NewsFeed({ items, isLoading }: NewsFeedProps) {
  if (isLoading) {
    return (
      <section className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Market Activity</h2>
          <p className={styles.description}>Latest news and price movements</p>
        </div>
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Market Activity</h2>
          <p className={styles.description}>Latest news and price movements</p>
        </div>
        <div className={styles.emptyState}>No recent activity</div>
      </section>
    );
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Market Activity</h2>
        <p className={styles.description}>Latest news and price movements</p>
      </div>
      <ul className={styles.list}>
        {items.map((item) => {
          const isNews = item.type === "news";
          const isPositive =
            item.type === "price_alert" && (item.meta?.priceChange ?? 0) > 0;
          
          let icon = <FaNewspaper />;
          if (item.type === "price_alert") {
            icon = isPositive ? <FaArrowUp style={{ color: 'var(--bull)' }} /> : <FaArrowDown style={{ color: 'var(--bear)' }} />;
          }

          return (
            <li key={item.id} className={styles.item}>
              <span className={styles.icon} style={{ fontSize: '1rem' }}>{icon}</span>
              <div className={styles.content}>
                <h3 className={styles.itemTitle}>
                  {isNews && item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title}
                    </a>
                  ) : item.type === "price_alert" && item.meta?.itemId ? (
                    <Link href={`/item/${item.meta.itemId}`}>
                      {item.meta.itemName || item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </h3>
                <p className={styles.summary}>{item.summary}</p>
                <div className={styles.meta}>
                  <span className={styles.timestamp}>
                    {formatRelativeTime(item.timestamp)}
                  </span>
                  {item.type === "price_alert" &&
                    item.meta?.priceChange !== undefined && (
                      <span
                        className={`${styles.priceChange} ${
                          isPositive ? styles.positive : styles.negative
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {item.meta.priceChange.toFixed(1)}%
                      </span>
                    )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
