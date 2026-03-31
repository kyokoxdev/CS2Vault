"use client";

/**
 * Item Detail Page — /item/[id]
 *
 * Shows candlestick chart + item stats for a specific item.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CandlestickChart from "@/components/charts/CandlestickChart";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import styles from "./ItemDetail.module.css";
import { usePageTitle } from "@/components/providers/PageTitleProvider";

interface ItemDetail {
    id: string;
    marketHashName: string;
    name: string;
    weapon: string | null;
    skin: string | null;
    category: string;
    type: string | null;
    rarity: string | null;
    exterior: string | null;
    isWatched: boolean;
    isActive: boolean;
    createdAt: string;
}

interface PriceSnapshot {
    price: number;
    source: string;
    timestamp: string;
}

interface ItemApiResponse {
    success: boolean;
    data?: ItemDetail;
}

export default function ItemDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [item, setItem] = useState<ItemDetail | null>(null);
    const [latestPrice, setLatestPrice] = useState<PriceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    usePageTitle(item?.name ?? null, { backLabel: "Back to Market Overview", backHref: "/" });

    const fetchItem = useCallback(async () => {
        setError(false);
        try {
            const itemRes = await fetch(`/api/items/${id}`);
            const itemData = (await itemRes.json()) as ItemApiResponse;

            if (itemData.success && itemData.data) {
                setItem(itemData.data);
            } else {
                setError(true);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError(true);
        }
        setLoading(false);
    }, [id]);

    useEffect(() => {
        fetchItem();
    }, [fetchItem]);

    const handleMarketSnapshotChange = useCallback((snapshot: {
        price: number | null;
        timestamp: string | null;
        source: string | null;
        interval: "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
    }) => {
        if (snapshot.price === null || snapshot.timestamp === null) {
            setLatestPrice(null);
            return;
        }

        setLatestPrice({
            price: snapshot.price,
            source: snapshot.source ?? snapshot.interval,
            timestamp: snapshot.timestamp,
        });
    }, []);

    if (loading) {
        return (
            <div className={styles.loadingState}>
                Loading...
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.notFound}>
                <div style={{ fontSize: 32, marginBottom: 12, color: "var(--bear)" }} aria-hidden="true">⚠</div>
                <h3>Something went wrong</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary-60)", marginBottom: 16 }}>
                    Failed to load item details. This may be a temporary issue.
                </p>
                <button
                    type="button"
                    onClick={() => { setLoading(true); fetchItem(); }}
                    style={{
                        padding: "8px 20px",
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        background: "var(--text-primary-90)",
                        color: "var(--surface-0)",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        marginBottom: 12,
                    }}
                >
                    Try again
                </button>
                <Link href="/" className={styles.backLink}>
                    ← Back to Market
                </Link>
            </div>
        );
    }

    if (!item) {
        return (
            <div className={styles.notFound}>
                <h3>Item not found</h3>
                <Link href="/" className={styles.backLink}>
                    ← Back to Market
                </Link>
            </div>
        );
    }

    const getRarityVariant = (rarity: string | null): "danger" | "warning" | "info" | "neutral" | "success" => {
        if (!rarity) return "neutral";
        const r = rarity.toLowerCase();
        if (r.includes("contraband") || r.includes("covert")) return "danger";
        if (r.includes("classified")) return "warning";
        if (r.includes("restricted")) return "info";
        return "neutral";
    };

    return (
        <div className={styles.page}>
            {/* Back link */}
            <Link href="/" className={styles.backLink}>
                ← Back to Market Overview
            </Link>

            {/* Item Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.itemName}>
                        {item.name}
                    </h2>
                    <div className={styles.marketHashName}>
                        {item.marketHashName}
                    </div>
                </div>
                <div className={styles.headerRight}>
                    {latestPrice && (
                        <>
                            <div className={styles.price}>
                                ${latestPrice.price.toFixed(2)}
                            </div>
                            <div className={styles.priceSource}>
                                via {latestPrice.source} •{" "}
                                {new Date(latestPrice.timestamp).toLocaleString()}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Row */}
            <div className={styles.statsGrid}>
                <StatCard
                    label="Category"
                    value={
                        <span className={styles.capitalized}>
                            {item.category}
                        </span>
                    }
                />
                
                {item.category === "weapon" && item.type && (
                    <StatCard
                        label="Weapon Type"
                        value={item.type}
                    />
                )}

                {item.rarity && (
                    <StatCard
                        label="Rarity"
                        value={
                            <Badge variant={getRarityVariant(item.rarity)}>
                                {item.rarity}
                            </Badge>
                        }
                    />
                )}

                {item.exterior && (
                    <StatCard
                        label="Exterior"
                        value={item.exterior}
                    />
                )}

                <StatCard
                    label="Status"
                    value={
                        item.isWatched ? (
                            <Badge variant="success">Watching</Badge>
                        ) : (
                            <Badge variant="neutral">Not watched</Badge>
                        )
                    }
                />
            </div>

            {/* Chart */}
            <CandlestickChart
                key={id}
                itemId={id}
                itemName={item.name}
                height={450}
                onMarketSnapshotChange={handleMarketSnapshotChange}
            />
        </div>
    );
}
