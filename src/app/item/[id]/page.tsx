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

export default function ItemDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [item, setItem] = useState<ItemDetail | null>(null);
    const [latestPrice, setLatestPrice] = useState<PriceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchItem = useCallback(async () => {
        try {
            const [itemRes, priceRes] = await Promise.all([
                fetch(`/api/items/${id}`),
                fetch(`/api/items/${id}/prices?interval=1d&limit=1`),
            ]);

            const itemData = await itemRes.json();
            const priceData = await priceRes.json();

            if (itemData.success) setItem(itemData.data);
            if (priceData.success && priceData.data.latestPrice) {
                setLatestPrice({
                    price: priceData.data.latestPrice,
                    source: "steam",
                    timestamp: priceData.data.latestTimestamp,
                });
            }
        } catch (err) {
            console.error("Fetch error:", err);
        }
        setLoading(false);
    }, [id]);

    useEffect(() => {
        fetchItem();
    }, [fetchItem]);

    if (loading) {
        return (
            <div className={styles.loadingState}>
                Loading...
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
            <CandlestickChart itemId={id} itemName={item.name} height={450} />
        </div>
    );
}
