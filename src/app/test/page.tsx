"use client";

/**
 * Smoke Test Page — /test
 *
 * Primitive UI to verify all backend features work.
 * NOT the final design — just functional testing.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Item {
    id: string;
    marketHashName: string;
    name: string;
    category: string;
    isWatched: boolean;
    currentPrice: number | null;
    priceSource: string | null;
    lastUpdated: string | null;
}

interface SyncLog {
    id: number;
    type: string;
    status: string;
    itemCount: number;
    duration: number | null;
    error: string | null;
    timestamp: string;
}

export default function SmokeTestPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
    const [status, setStatus] = useState("");
    const [newItemName, setNewItemName] = useState("");
    const [newItemHash, setNewItemHash] = useState("");

    const fetchItems = useCallback(async () => {
        try {
            const res = await fetch("/api/items");
            const data = await res.json();
            if (data.success) setItems(data.data.items);
            else setStatus(`❌ Items: ${data.error}`);
        } catch (err) {
            setStatus(`❌ Items fetch failed: ${err}`);
        }
    }, []);

    const fetchSyncLogs = useCallback(async () => {
        try {
            const res = await fetch("/api/sync");
            const data = await res.json();
            if (data.success) setSyncLogs(data.data.logs);
        } catch (err) {
            setStatus(`❌ Sync logs failed: ${err}`);
        }
    }, []);

    useEffect(() => {
        fetchItems();
        fetchSyncLogs();
    }, [fetchItems, fetchSyncLogs]);

    async function handleSync() {
        setStatus("⏳ Syncing...");
        try {
            const res = await fetch("/api/sync", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                setStatus(
                    `✅ Sync: ${data.data.status} — ${data.data.itemCount} items in ${data.data.duration}ms`
                );
                fetchItems();
                fetchSyncLogs();
            } else {
                setStatus(`❌ Sync failed: ${data.error}`);
            }
        } catch (err) {
            setStatus(`❌ Sync error: ${err}`);
        }
    }

    async function handleAddItem() {
        if (!newItemHash || !newItemName) return;
        setStatus("⏳ Adding item...");
        try {
            const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    marketHashName: newItemHash,
                    name: newItemName,
                    category: "weapon",
                    isWatched: true,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setStatus(`✅ Added: ${data.data.name}`);
                setNewItemHash("");
                setNewItemName("");
                fetchItems();
            } else {
                setStatus(`❌ Add failed: ${data.error}`);
            }
        } catch (err) {
            setStatus(`❌ Add error: ${err}`);
        }
    }

    async function handleToggleWatch(id: string, current: boolean) {
        try {
            const res = await fetch(`/api/items/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isWatched: !current }),
            });
            const data = await res.json();
            if (data.success) fetchItems();
            else setStatus(`❌ Toggle failed: ${data.error}`);
        } catch (err) {
            setStatus(`❌ Toggle error: ${err}`);
        }
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setStatus("✅ Item deleted");
                fetchItems();
            } else {
                setStatus(`❌ Delete failed: ${data.error}`);
            }
        } catch (err) {
            setStatus(`❌ Delete error: ${err}`);
        }
    }

    return (
        <div style={{ fontFamily: "monospace", padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <h1>🧪 CS2Vault Smoke Test</h1>
            <p style={{ color: "#888" }}>
                Primitive test UI — not the final design. Verifies backend features work.
            </p>

            {status && (
                <div
                    style={{
                        padding: 12,
                        marginBottom: 16,
                        background: status.startsWith("✅") ? "#1a3a1a" : status.startsWith("❌") ? "#3a1a1a" : "#3a3a1a",
                        borderRadius: 6,
                        color: "#fff",
                    }}
                >
                    {status}
                </div>
            )}

            {/* Auth Status */}
            <section style={{ marginBottom: 24 }}>
                <h2>🔐 Authentication</h2>
                <Link href="/api/auth/steam/login" style={{ color: "#66f", marginRight: 16 }}>
                    Login with Steam →
                </Link>
                <Link href="/api/auth/session" style={{ color: "#6f6" }}>
                    Check Session →
                </Link>
            </section>

            {/* Add Item */}
            <section style={{ marginBottom: 24 }}>
                <h2>➕ Add Item</h2>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        placeholder="Market Hash Name (e.g. AK-47 | Redline (Field-Tested))"
                        value={newItemHash}
                        onChange={(e) => setNewItemHash(e.target.value)}
                        style={{ flex: 2, padding: 8, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4 }}
                    />
                    <input
                        placeholder="Display Name"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        style={{ flex: 1, padding: 8, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4 }}
                    />
                    <button onClick={handleAddItem} style={{ padding: "8px 16px", cursor: "pointer" }}>
                        Add
                    </button>
                </div>
            </section>

            {/* Sync Controls */}
            <section style={{ marginBottom: 24 }}>
                <h2>🔄 Sync</h2>
                <button onClick={handleSync} style={{ padding: "8px 24px", cursor: "pointer", fontSize: 16 }}>
                    Trigger Sync Now
                </button>
            </section>

            {/* Items Table */}
            <section style={{ marginBottom: 24 }}>
                <h2>📦 Items ({items.length})</h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #444", textAlign: "left" }}>
                            <th style={{ padding: 8 }}>Name</th>
                            <th style={{ padding: 8 }}>Price</th>
                            <th style={{ padding: 8 }}>Source</th>
                            <th style={{ padding: 8 }}>Watched</th>
                            <th style={{ padding: 8 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: 8 }}>
                                    <strong>{item.name}</strong>
                                    <br />
                                    <small style={{ color: "#888" }}>{item.marketHashName}</small>
                                </td>
                                <td style={{ padding: 8, color: item.currentPrice ? "#4f4" : "#888" }}>
                                    {item.currentPrice ? `$${item.currentPrice.toFixed(2)}` : "—"}
                                </td>
                                <td style={{ padding: 8 }}>{item.priceSource ?? "—"}</td>
                                <td style={{ padding: 8 }}>{item.isWatched ? "✅" : "❌"}</td>
                                <td style={{ padding: 8 }}>
                                    <button
                                        onClick={() => handleToggleWatch(item.id, item.isWatched)}
                                        style={{ marginRight: 8, cursor: "pointer" }}
                                    >
                                        {item.isWatched ? "Unwatch" : "Watch"}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        style={{ color: "#f44", cursor: "pointer" }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#666" }}>
                                    No items. Add one above.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Sync Logs */}
            <section>
                <h2>📋 Sync History ({syncLogs.length})</h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #444", textAlign: "left" }}>
                            <th style={{ padding: 8 }}>Time</th>
                            <th style={{ padding: 8 }}>Status</th>
                            <th style={{ padding: 8 }}>Items</th>
                            <th style={{ padding: 8 }}>Duration</th>
                            <th style={{ padding: 8 }}>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {syncLogs.map((log) => (
                            <tr key={log.id} style={{ borderBottom: "1px solid #333" }}>
                                <td style={{ padding: 8 }}>{new Date(log.timestamp).toLocaleString()}</td>
                                <td style={{ padding: 8, color: log.status === "success" ? "#4f4" : "#f44" }}>
                                    {log.status}
                                </td>
                                <td style={{ padding: 8 }}>{log.itemCount}</td>
                                <td style={{ padding: 8 }}>{log.duration ? `${log.duration}ms` : "—"}</td>
                                <td style={{ padding: 8, color: "#f88" }}>{log.error ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
