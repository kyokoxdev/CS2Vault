"use client";

import { useState, useEffect } from "react";
import styles from "./Settings.module.css";
import { FaSave, FaRobot, FaChartLine, FaClock, FaSyncAlt } from "react-icons/fa";
import { AI_MODELS } from "@/lib/ai/model-labels";
import { Select } from "@/components/ui/Select";

interface AppSettings {
    activeMarketSource: string;
    activeAIProvider: string;
    priceRefreshIntervalMin: number;
    openAiApiKey: string;
    geminiApiKey: string;
    csfloatApiKey: string;
    csgotraderSubProvider: string;
}

const API_KEY_FIELDS = ["openAiApiKey", "geminiApiKey", "csfloatApiKey"] as const;
type ApiKeyField = typeof API_KEY_FIELDS[number];
const SAVED_KEY_INDICATOR = "••••••••••••••••";

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [refreshingMarketCap, setRefreshingMarketCap] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [savedKeyMasks, setSavedKeyMasks] = useState<Record<string, string>>({});
    const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                const masks: Record<string, string> = {};
                for (const key of API_KEY_FIELDS) {
                    if (data[key]) {
                        masks[key] = data[key];
                    }
                }
                setSavedKeyMasks(masks);
                setSettings({
                    ...data,
                    openAiApiKey: "",
                    geminiApiKey: "",
                    csfloatApiKey: "",
                });
            })
            .catch(err => console.error("Failed to load settings:", err));
    }, []);

    const handleChange = (field: keyof AppSettings, value: string | number) => {
        if (!settings) return;
        setSettings({ ...settings, [field]: value });
    };

    const isKeySaved = (field: string): boolean => !!savedKeyMasks[field];
    const isEditingKey = (field: string): boolean => editingKeys.has(field);

    const getKeyDisplayValue = (field: ApiKeyField): string => {
        if (isEditingKey(field)) return settings?.[field] as string ?? "";
        if (isKeySaved(field)) return SAVED_KEY_INDICATOR;
        return settings?.[field] as string ?? "";
    };

    const handleKeyFocus = (field: string) => {
        setEditingKeys(prev => new Set(prev).add(field));
    };

    const handleKeyBlur = (field: ApiKeyField) => {
        if (!settings?.[field]) {
            setEditingKeys(prev => {
                const next = new Set(prev);
                next.delete(field);
                return next;
            });
        }
    };

    const handleKeyChange = (field: ApiKeyField, value: string) => {
        handleChange(field, value);
    };

    const handleSave = async () => {
        if (!settings) return;

        setSaving(true);
        setMessage(null);

        // Build payload: for untouched saved keys, send the masked value
        // so the API's resolveApiKey() will skip them and preserve the real key
        const payload = { ...settings };
        for (const key of API_KEY_FIELDS) {
            if (!isEditingKey(key) && isKeySaved(key)) {
                (payload as Record<string, unknown>)[key] = savedKeyMasks[key];
            }
        }

        try {
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("Failed to save settings");

            const data = await res.json();

            const newMasks: Record<string, string> = {};
            for (const key of API_KEY_FIELDS) {
                if (data[key]) {
                    newMasks[key] = data[key];
                }
            }
            setSavedKeyMasks(newMasks);
            setEditingKeys(new Set());

            setSettings({
                ...data,
                openAiApiKey: "",
                geminiApiKey: "",
                csfloatApiKey: "",
            });

            setMessage({ text: "Settings saved successfully! The AI and Market engines have been updated.", type: "success" });
        } catch (error) {
            console.error(error);
            setMessage({ text: "Error saving settings. Please try again.", type: "error" });
        } finally {
            setSaving(false);
            // Hide success message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleRefreshMarketCap = async () => {
        setRefreshingMarketCap(true);
        setMessage(null);

        try {
            const res = await fetch("/api/market/market-cap-sync", {
                method: "POST",
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to refresh market cap");
            }

            if (data.data?.skipped) {
                setMessage({ text: "Market cap is already fresh. No recalculation was needed.", type: "success" });
                return;
            }

            const totalMarketCap = typeof data.data?.totalMarketCap === "number"
                ? `$${data.data.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "Market cap";
            setMessage({ text: `${totalMarketCap} refreshed successfully.`, type: "success" });
        } catch (error) {
            console.error(error);
            setMessage({ text: "Error refreshing market cap. Please try again.", type: "error" });
        } finally {
            setRefreshingMarketCap(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    if (!settings) {
        return <div className={styles.loading}>Loading configuration...</div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Provider Configuration</h1>
                <p className={styles.subtitle}>Manage your AI models, Market data flows, and secure API keys.</p>
            </header>

            <div className={styles.grid}>
                {/* AI Agents Panel */}
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <FaRobot className={styles.icon} />
                        <h2>AI Market Agent</h2>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-active-engine">Active Engine</label>
                        <Select
                            id="settings-active-engine"
                            value={settings.activeAIProvider}
                            onChange={(val) => handleChange("activeAIProvider", val)}
                            className={styles.select}
                            options={AI_MODELS.map(model => ({ label: model.label, value: model.value }))}
                        />
                        <p className={styles.helpText}>Select the underlying language model powering the `/chat` analyst.</p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-gemini-key">Google Gemini API Key</label>
                        <input
                            id="settings-gemini-key"
                            type="password"
                            value={getKeyDisplayValue("geminiApiKey")}
                            onChange={(e) => handleKeyChange("geminiApiKey", e.target.value)}
                            onFocus={() => handleKeyFocus("geminiApiKey")}
                            onBlur={() => handleKeyBlur("geminiApiKey")}
                            placeholder="AIzaSy..."
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-openai-key">OpenAI API Key</label>
                        <input
                            id="settings-openai-key"
                            type="password"
                            value={getKeyDisplayValue("openAiApiKey")}
                            onChange={(e) => handleKeyChange("openAiApiKey", e.target.value)}
                            onFocus={() => handleKeyFocus("openAiApiKey")}
                            onBlur={() => handleKeyBlur("openAiApiKey")}
                            placeholder="sk-..."
                            className={styles.input}
                        />
                    </div>
                </section>

                {/* Market Data Panel */}
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <FaChartLine className={styles.icon} />
                        <h2>Market Data Source</h2>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-market-source">Primary Pricing Feed</label>
                        <Select
                            id="settings-market-source"
                            value={settings.activeMarketSource}
                            onChange={(val) => handleChange("activeMarketSource", val)}
                            className={styles.select}
                            options={[
                                { label: "Pricempire", value: "pricempire" },
                                { label: "CSFloat API (Recommended)", value: "csfloat" },
                                { label: "CSGOTrader Multi-Market", value: "csgotrader" },
                                { label: "Steam Community Market", value: "steam" }
                            ]}
                        />
                        <p className={styles.helpText}>Choose your primary pricing feed. CSFloat uses bulk cache + API fallback. CSGOTrader aggregates 14 markets.</p>
                    </div>

                    {settings.activeMarketSource === "csgotrader" && (
                        <div className={styles.formGroup} style={{ marginLeft: "1.5rem" }}>
                            <label htmlFor="settings-sub-provider">Sub-Provider</label>
                            <Select
                                id="settings-sub-provider"
                                value={settings.csgotraderSubProvider}
                                onChange={(val) => handleChange("csgotraderSubProvider", val)}
                                className={styles.select}
                                options={[
                                    { label: "CSFloat (Recommended)", value: "csfloat" },
                                    { label: "Buff163", value: "buff163" },
                                    { label: "Steam", value: "steam" },
                                    { label: "BitSkins", value: "bitskins" },
                                    { label: "Skinport", value: "skinport" },
                                    { label: "CS.Money", value: "csmoney" },
                                    { label: "CSGOEmpire", value: "csgoempire" },
                                    { label: "CS:GO Trade Market", value: "csgotm" },
                                    { label: "LootFarm", value: "lootfarm" },
                                    { label: "Swap.gg", value: "swapgg" },
                                    { label: "CS.Trade", value: "cstrade" },
                                    { label: "CSGOTrader", value: "csgotrader" },
                                    { label: "YouPin", value: "youpin" },
                                    { label: "Lisskins", value: "lisskins" }
                                ]}
                            />
                            <p className={styles.helpText}>Select which market&apos;s pricing data to use via CSGOTrader aggregation.</p>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-csfloat-key">CSFloat API Key</label>
                        <input
                            id="settings-csfloat-key"
                            type="password"
                            value={getKeyDisplayValue("csfloatApiKey")}
                            onChange={(e) => handleKeyChange("csfloatApiKey", e.target.value)}
                            onFocus={() => handleKeyFocus("csfloatApiKey")}
                            onBlur={() => handleKeyBlur("csfloatApiKey")}
                            placeholder="Optional. Required if Feed is CSFloat..."
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-price-refresh-interval">
                            <FaClock className={styles.inlineIcon} />
                            Browser Refresh Interval (Minutes)
                        </label>
                        <input
                            id="settings-price-refresh-interval"
                            type="number"
                            min="1"
                            max="1440"
                            value={settings.priceRefreshIntervalMin}
                            onChange={(e) => handleChange("priceRefreshIntervalMin", parseInt(e.target.value) || 15)}
                            className={styles.input}
                        />
                        <p className={styles.helpText}>How often open browser sessions refresh watchlist, portfolio, and dashboard market data without needing server cron.</p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-refresh-market-cap">Market Cap Controls</label>
                        <button
                            id="settings-refresh-market-cap"
                            type="button"
                            onClick={handleRefreshMarketCap}
                            disabled={refreshingMarketCap}
                            className={styles.secondaryBtn}
                        >
                            <FaSyncAlt />
                            {refreshingMarketCap ? "Refreshing Market Cap..." : "Refresh Market Cap"}
                        </button>
                        <p className={styles.helpText}>Forces a fresh weighted market-cap calculation immediately, even if the daily cron has not run yet.</p>
                    </div>
                </section>
            </div>

            <div className={styles.actions}>
                {message && (
                    <div className={message.type === "success" ? styles.successMsg : styles.errorMsg}>
                        {message.text}
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className={styles.saveBtn}
                >
                    <FaSave />
                    {saving ? "Saving Configuration..." : "Save Configuration"}
                </button>
            </div>
        </div>
    );
}
