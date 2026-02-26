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
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                Loading...
            </div>
        );
    }

    if (!item) {
        return (
            <div style={{ padding: 40, textAlign: "center" }}>
                <h3>Item not found</h3>
                <Link href="/" style={{ marginTop: 16, display: "inline-block" }}>
                    ← Back to Market
                </Link>
            </div>
        );
    }

    return (
        <>
            {/* Back link */}
            <Link
                href="/"
                style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginBottom: 16,
                    display: "inline-block",
                }}
            >
                ← Back to Market Overview
            </Link>

            {/* Item Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 24,
                }}
            >
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                        {item.name}
                    </h2>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        {item.marketHashName}
                    </div>
                </div>
                <div style={{ textAlign: "right" }}>
                    {latestPrice && (
                        <>
                            <div
                                style={{
                                    fontSize: 28,
                                    fontWeight: 700,
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--green)",
                                }}
                            >
                                ${latestPrice.price.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                via {latestPrice.source} •{" "}
                                {new Date(latestPrice.timestamp).toLocaleString()}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Row */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-label">Category</div>
                    <div className="stat-value" style={{ fontSize: 16, textTransform: "capitalize" }}>
                        {item.category}
                    </div>
                </div>
                {item.category === "weapon" && item.type && (
                    <div className="stat-card">
                        <div className="stat-label">Weapon Type</div>
                        <div className="stat-value" style={{ fontSize: 16 }}>
                            {item.type}
                        </div>
                    </div>
                )}
                {item.rarity && (
                    <div className="stat-card">
                        <div className="stat-label">Rarity</div>
                        <div className="stat-value" style={{ fontSize: 16 }}>
                            {item.rarity}
                        </div>
                    </div>
                )}
                {item.exterior && (
                    <div className="stat-card">
                        <div className="stat-label">Exterior</div>
                        <div className="stat-value" style={{ fontSize: 16 }}>
                            {item.exterior}
                        </div>
                    </div>
                )}
                <div className="stat-card">
                    <div className="stat-label">Status</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                        {item.isWatched ? (
                            <span style={{ color: "var(--green)" }}>✅ Watching</span>
                        ) : (
                            <span style={{ color: "var(--text-muted)" }}>Not watched</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Chart */}
            <CandlestickChart itemId={id} itemName={item.name} height={450} />
        </>
    );
}
