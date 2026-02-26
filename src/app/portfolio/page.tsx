"use client";

/**
 * Portfolio Dashboard
 *
 * Displays user's CS2 inventory with P&L tracking.
 * Features: summary cards, inventory table, cost basis editing, Steam sync.
 */

import { useState, useEffect, useCallback } from "react";

interface PortfolioItem {
    id: string;
    assetId: string;
    name: string;
    marketHashName: string;
    category: string;
    type: string | null;
    rarity: string | null;
    exterior: string | null;
    imageUrl: string | null;
    currentPrice: number;
    acquiredPrice: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    floatValue: number | null;
    wearQuality: string | null;
    acquiredAt: string;
}

interface PortfolioData {
    totalCurrentValue: number;
    totalAcquiredValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    itemCount: number;
    filteredCount?: number;
    items: PortfolioItem[];
    filteredTotals?: {
        totalCurrentValue: number;
        totalAcquiredValue: number;
        unrealizedPnL: number;
        unrealizedPnLPercent: number;
    };
    filter?: {
        category: string | null;
        rarity: string | null;
        search: string | null;
        price: string | null;
    };
    filterOptions?: {
        categories: string[];
        rarities: string[];
    };
}

const CATEGORY_ICONS: Record<string, string> = {
    weapon: "🔫", container: "📦", key: "🔑", knife: "🔪", glove: "🧤",
    sticker: "🏷️", agent: "🕵️", graffiti: "🎨", music_kit: "🎵",
    patch: "🩹", collectible: "🏆", tool: "🔧",
};

const RARITY_COLORS: Record<string, string> = {
    "Contraband": "#e4ae39",
    "Covert": "#eb4b4b",
    "Classified": "#d32ce6",
    "Restricted": "#8847ff",
    "Mil-Spec": "#4b69ff",
    "Industrial Grade": "#5e98d9",
    "Consumer Grade": "#b0c3d9",
    "Base Grade": "#b0c3d9",
    "Distinguished": "#4b69ff",
    "Exceptional": "#8847ff",
    "Superior": "#d32ce6",
    "Master": "#eb4b4b",
    "High Grade": "#4b69ff",
    "Remarkable": "#8847ff",
    "Exotic": "#d32ce6",
    "Extraordinary": "#eb4b4b",
};

export default function PortfolioPage() {
    const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPrice, setEditPrice] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [rarityFilter, setRarityFilter] = useState("");
    const [priceFilter, setPriceFilter] = useState("all");
    const [searchFilter, setSearchFilter] = useState("");
    const [refreshingPrices, setRefreshingPrices] = useState(false);
    const [pendingSearch, setPendingSearch] = useState("");

    const fetchPortfolio = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (categoryFilter) params.set("category", categoryFilter);
            if (rarityFilter) params.set("rarity", rarityFilter);
            if (searchFilter) params.set("search", searchFilter);
            if (priceFilter && priceFilter !== "all") params.set("price", priceFilter);
            const res = await fetch(`/api/portfolio?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setPortfolio(data.data);
            }
        } catch (err) {
            console.error("Failed to fetch portfolio:", err);
        } finally {
            setLoading(false);
        }
    }, [categoryFilter, rarityFilter, searchFilter, priceFilter]);

    useEffect(() => {
        fetchPortfolio();
    }, [fetchPortfolio]);

    useEffect(() => {
        setPendingSearch(searchFilter);
    }, [searchFilter]);

    async function handleSync() {
        setSyncing(true);
        setSyncStatus("Fetching inventory from Steam...");
        try {
            const res = await fetch("/api/inventory", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                const coverage = data.data?.priceCoverage;
                const limited = data.data?.priceLimitedTo;
                const limitLabel = limited ? ` (limited to ${limited})` : "";
                const coverageLabel = coverage
                    ? ` • Priced ${coverage.priced}/${coverage.total}${limitLabel}`
                    : "";
                setSyncStatus(`✅ Synced ${data.data.synced} items from Steam${coverageLabel}`);
                await fetchPortfolio();
            } else {
                setSyncStatus(`❌ ${data.error}`);
            }
        } catch (err) {
            setSyncStatus(`❌ Error: ${err}`);
        }
        setSyncing(false);
    }

    const handleRefreshPrices = useCallback(async () => {
        setRefreshingPrices(true);
        setSyncStatus("Refreshing prices...");
        try {
            const res = await fetch("/api/portfolio/prices", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                const limited = data.data?.priceLimitedTo;
                const limitLabel = limited ? ` (limited to ${limited})` : "";
                setSyncStatus(`✅ Refreshed prices for ${data.data.pricedCount ?? 0} items${limitLabel}`);
                await fetchPortfolio();
            } else {
                setSyncStatus(`❌ ${data.error}`);
            }
        } catch (err) {
            setSyncStatus(`❌ Error: ${err}`);
        }
        setRefreshingPrices(false);
    }, [fetchPortfolio]);

    useEffect(() => {
        const rawInterval = process.env.NEXT_PUBLIC_PRICE_REFRESH_MINUTES;
        const intervalMin = rawInterval ? Number.parseInt(rawInterval, 10) : 5;
        if (!Number.isFinite(intervalMin) || intervalMin <= 0) return;

        const intervalMs = intervalMin * 60 * 1000;
        const timer = setInterval(() => {
            handleRefreshPrices();
        }, intervalMs);

        return () => clearInterval(timer);
    }, [handleRefreshPrices]);

    async function handleUpdatePrice(itemId: string) {
        const price = parseFloat(editPrice);
        if (isNaN(price) || price < 0) return;

        try {
            const res = await fetch(`/api/inventory/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ acquiredPrice: price }),
            });
            const data = await res.json();
            if (data.success) {
                setEditingId(null);
                setEditPrice("");
                await fetchPortfolio();
            }
        } catch (err) {
            console.error("Update failed:", err);
        }
    }

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>💼</div>
                    <div>Loading portfolio...</div>
                </div>
            </div>
        );
    }

    const isEmpty = !portfolio || portfolio.itemCount === 0;
    const categories = portfolio?.filterOptions?.categories ?? [];
    const rarities = portfolio?.filterOptions?.rarities ?? [];
    const hasActiveFilters = Boolean(
        categoryFilter || rarityFilter || searchFilter || (priceFilter && priceFilter !== "all")
    );
    const totals = hasActiveFilters && portfolio?.filteredTotals
        ? portfolio.filteredTotals
        : portfolio;
    const itemCount = hasActiveFilters
        ? (portfolio?.filteredCount ?? portfolio?.itemCount ?? 0)
        : (portfolio?.itemCount ?? 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h3 style={{ margin: 0, color: "var(--text-primary)" }}>Your Portfolio</h3>
                    <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
                        Track your CS2 inventory value and profit/loss
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                        onClick={handleRefreshPrices}
                        disabled={refreshingPrices}
                        className="btn"
                        style={{
                            background: refreshingPrices ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                            padding: "10px 16px",
                            borderRadius: 8,
                            cursor: refreshingPrices ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transition: "all 0.15s",
                        }}
                    >
                        {refreshingPrices ? "⏳ Refreshing..." : "💲 Refresh Prices"}
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="btn"
                        style={{
                            background: syncing ? "var(--bg-tertiary)" : "var(--accent)",
                            color: syncing ? "var(--text-muted)" : "#000",
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: 8,
                            cursor: syncing ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transition: "all 0.15s",
                        }}
                    >
                        {syncing ? "⏳ Syncing..." : "🔄 Sync from Steam"}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Filters</div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 12,
                    }}
                >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                        <option key={category} value={category}>
                            {category.replace("_", " ")}
                        </option>
                    ))}
                </select>
                <select
                    value={rarityFilter}
                    onChange={(e) => setRarityFilter(e.target.value)}
                    style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 12,
                    }}
                >
                    <option value="">All rarities</option>
                    {rarities.map((rarity) => (
                        <option key={rarity} value={rarity}>
                            {rarity}
                        </option>
                    ))}
                </select>
                <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 12,
                    }}
                >
                    <option value="all">All prices</option>
                    <option value="priced">Priced</option>
                    <option value="unpriced">Unpriced</option>
                </select>
                <input
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            setSearchFilter(pendingSearch.trim());
                        }
                    }}
                    placeholder="Search items"
                    style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 12,
                        minWidth: 200,
                    }}
                />
                <button
                    onClick={() => setSearchFilter(pendingSearch.trim())}
                    className="btn"
                    style={{
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                    }}
                >
                    Apply
                </button>
                <button
                    onClick={() => {
                        setCategoryFilter("");
                        setRarityFilter("");
                        setPriceFilter("all");
                        setSearchFilter("");
                        setPendingSearch("");
                    }}
                    className="btn"
                    style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                    }}
                >
                    Clear
                </button>
                <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
                    {portfolio?.filteredCount ?? portfolio?.itemCount ?? 0} items
                </div>
            </div>

            {syncStatus && (
                <div style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: syncStatus.startsWith("✅") ? "rgba(0, 200, 83, 0.1)" : syncStatus.startsWith("❌") ? "rgba(255, 82, 82, 0.1)" : "var(--bg-secondary)",
                    color: syncStatus.startsWith("✅") ? "var(--green)" : syncStatus.startsWith("❌") ? "var(--red)" : "var(--text-secondary)",
                    fontSize: 13,
                    border: `1px solid ${syncStatus.startsWith("✅") ? "rgba(0, 200, 83, 0.2)" : syncStatus.startsWith("❌") ? "rgba(255, 82, 82, 0.2)" : "var(--border)"}`,
                }}>
                    {syncStatus}
                </div>
            )}

            {isEmpty ? (
                /* Empty State */
                <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
                    <h3 style={{ color: "var(--text-primary)", marginBottom: 8 }}>No inventory items yet</h3>
                    <p style={{ color: "var(--text-muted)", marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
                        Sync your Steam CS2 inventory to start tracking your portfolio value and profit/loss.
                    </p>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        style={{
                            background: "var(--accent)",
                            color: "#000",
                            border: "none",
                            padding: "12px 28px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: 14,
                        }}
                    >
                        🔄 Sync from Steam
                    </button>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="stats-grid">
                        <div className="card stat-card">
                            <div className="stat-label">Total Value</div>
                            <div className="stat-value" style={{ color: "var(--accent)" }}>
                                ${totals!.totalCurrentValue.toFixed(2)}
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-label">Cost Basis</div>
                            <div className="stat-value">
                                {totals!.totalAcquiredValue > 0
                                    ? `$${totals!.totalAcquiredValue.toFixed(2)}`
                                    : "—"
                                }
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-label">Unrealized P&L</div>
                            <div className="stat-value" style={{
                                color: totals!.unrealizedPnL > 0 ? "var(--green)" : totals!.unrealizedPnL < 0 ? "var(--red)" : "var(--text-secondary)",
                            }}>
                                {totals!.totalAcquiredValue > 0 ? (
                                    <>
                                        {totals!.unrealizedPnL >= 0 ? "+" : ""}
                                        ${totals!.unrealizedPnL.toFixed(2)}
                                        <span style={{ fontSize: 13, marginLeft: 6, opacity: 0.7 }}>
                                            ({totals!.unrealizedPnLPercent >= 0 ? "+" : ""}
                                            {totals!.unrealizedPnLPercent.toFixed(1)}%)
                                        </span>
                                    </>
                                ) : "—"}
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-label">Items</div>
                            <div className="stat-value">{itemCount}</div>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div className="card" style={{ overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Category</th>
                                        <th>Weapon Type</th>
                                        <th>Rarity</th>
                                        <th>Wear</th>
                                        <th style={{ textAlign: "right" }}>Current Price</th>
                                        <th style={{ textAlign: "right" }}>Cost Basis</th>
                                        <th style={{ textAlign: "right" }}>P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {portfolio!.items.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    {item.imageUrl && (
                                                        <img
                                                            src={item.imageUrl}
                                                            alt={item.name}
                                                            style={{
                                                                width: 40,
                                                                height: 30,
                                                                objectFit: "contain",
                                                                borderRadius: 4,
                                                                background: "var(--bg-tertiary)",
                                                            }}
                                                        />
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                                                        {item.exterior && (
                                                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                                                {item.exterior}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 12 }}>
                                                    {CATEGORY_ICONS[item.category] ?? "📦"}{" "}
                                                    <span style={{ textTransform: "capitalize" }}>
                                                        {item.category.replace("_", " ")}
                                                    </span>
                                                </span>
                                            </td>
                                            <td>
                                                {item.category === "weapon" && item.type ? (
                                                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                                                        {item.type}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                {item.rarity ? (
                                                    <span style={{
                                                        color: RARITY_COLORS[item.rarity] ?? "var(--text-secondary)",
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                    }}>
                                                        {item.rarity}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                {item.category === "weapon" && item.wearQuality ? (
                                                    <span style={{ fontSize: 12 }}>{item.wearQuality}</span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", fontFamily: "var(--font-jetbrains)", fontSize: 13 }}>
                                                {item.currentPrice > 0 ? (
                                                    `$${item.currentPrice.toFixed(2)}`
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>Price unavailable</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                {editingId === item.id ? (
                                                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={editPrice}
                                                            onChange={(e) => setEditPrice(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") handleUpdatePrice(item.id);
                                                                if (e.key === "Escape") { setEditingId(null); setEditPrice(""); }
                                                            }}
                                                            autoFocus
                                                            style={{
                                                                width: 80,
                                                                padding: "4px 6px",
                                                                borderRadius: 4,
                                                                border: "1px solid var(--accent)",
                                                                background: "var(--bg-primary)",
                                                                color: "var(--text-primary)",
                                                                fontSize: 12,
                                                                fontFamily: "var(--font-jetbrains)",
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => handleUpdatePrice(item.id)}
                                                            style={{
                                                                background: "var(--accent)",
                                                                color: "#000",
                                                                border: "none",
                                                                borderRadius: 4,
                                                                padding: "4px 8px",
                                                                cursor: "pointer",
                                                                fontSize: 11,
                                                            }}
                                                        >
                                                            ✓
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span
                                                        onClick={() => {
                                                            setEditingId(item.id);
                                                            setEditPrice(item.acquiredPrice?.toString() ?? "");
                                                        }}
                                                        title="Click to edit cost basis"
                                                        style={{
                                                            cursor: "pointer",
                                                            fontFamily: "var(--font-jetbrains)",
                                                            fontSize: 13,
                                                            borderBottom: "1px dashed var(--text-muted)",
                                                            paddingBottom: 1,
                                                        }}
                                                    >
                                                        {item.acquiredPrice != null
                                                            ? `$${item.acquiredPrice.toFixed(2)}`
                                                            : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Set price</span>
                                                        }
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", fontFamily: "var(--font-jetbrains)", fontSize: 13 }}>
                                                {item.pnl != null ? (
                                                    <span style={{
                                                        color: item.pnl > 0 ? "var(--green)" : item.pnl < 0 ? "var(--red)" : "var(--text-secondary)",
                                                        fontWeight: 500,
                                                    }}>
                                                        {item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}
                                                        <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 11 }}>
                                                            {item.pnlPercent != null && `(${item.pnlPercent >= 0 ? "+" : ""}${item.pnlPercent.toFixed(1)}%)`}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
