"use client";

import { useState, useEffect } from "react";
import styles from "./Settings.module.css";
import { FaSave, FaRobot, FaChartLine, FaClock } from "react-icons/fa";
import { AI_MODELS } from "@/lib/ai/model-labels";

interface AppSettings {
    activeMarketSource: string;
    activeAIProvider: string;
    syncIntervalMin: number;
    openAiApiKey: string;
    geminiApiKey: string;
    csfloatApiKey: string;
    csgotraderSubProvider: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    useEffect(() => {
        // Load initial settings
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => setSettings(data))
            .catch(err => console.error("Failed to load settings:", err));
    }, []);

    const handleChange = (field: keyof AppSettings, value: string | number) => {
        if (!settings) return;
        setSettings({ ...settings, [field]: value });
    };

    const handleSave = async () => {
        if (!settings) return;

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (!res.ok) throw new Error("Failed to save settings");

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
                        <label>Active Engine</label>
                        <select
                            value={settings.activeAIProvider}
                            onChange={(e) => handleChange("activeAIProvider", e.target.value)}
                            className={styles.select}
                            aria-label="AI model selection"
                        >
                            {AI_MODELS.map((model) => (
                                <option key={model.value} value={model.value}>
                                    {model.label}
                                </option>
                            ))}
                        </select>
                        <p className={styles.helpText}>Select the underlying language model powering the `/chat` analyst.</p>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Google Gemini API Key</label>
                        <input
                            type="password"
                            value={settings.geminiApiKey}
                            onChange={(e) => handleChange("geminiApiKey", e.target.value)}
                            placeholder="AIzaSy..."
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>OpenAI API Key</label>
                        <input
                            type="password"
                            value={settings.openAiApiKey}
                            onChange={(e) => handleChange("openAiApiKey", e.target.value)}
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
                        <label>Primary Pricing Feed</label>
                        <select
                            value={settings.activeMarketSource}
                            onChange={(e) => handleChange("activeMarketSource", e.target.value)}
                            className={styles.select}
                        >
                            <option value="pricempire">Pricempire</option>
                            <option value="csfloat">CSFloat API (Recommended)</option>
                            <option value="csgotrader">CSGOTrader Multi-Market</option>
                            <option value="steam">Steam Community Market</option>
                        </select>
                        <p className={styles.helpText}>Choose your primary pricing feed. CSFloat uses bulk cache + API fallback. CSGOTrader aggregates 14 markets.</p>
                    </div>

                    {settings.activeMarketSource === "csgotrader" && (
                        <div className={styles.formGroup} style={{ marginLeft: "1.5rem" }}>
                            <label>Sub-Provider</label>
                            <select
                                value={settings.csgotraderSubProvider}
                                onChange={(e) => handleChange("csgotraderSubProvider", e.target.value)}
                                className={styles.select}
                            >
                                <option value="csfloat">CSFloat (Recommended)</option>
                                <option value="buff163">Buff163</option>
                                <option value="steam">Steam</option>
                                <option value="bitskins">BitSkins</option>
                                <option value="skinport">Skinport</option>
                                <option value="csmoney">CS.Money</option>
                                <option value="csgoempire">CSGOEmpire</option>
                                <option value="csgotm">CS:GO Trade Market</option>
                                <option value="lootfarm">LootFarm</option>
                                <option value="swapgg">Swap.gg</option>
                                <option value="cstrade">CS.Trade</option>
                                <option value="csgotrader">CSGOTrader</option>
                                <option value="youpin">YouPin</option>
                                <option value="lisskins">Lisskins</option>
                            </select>
                            <p className={styles.helpText}>Select which market&apos;s pricing data to use via CSGOTrader aggregation.</p>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label>CSFloat API Key</label>
                        <input
                            type="password"
                            value={settings.csfloatApiKey}
                            onChange={(e) => handleChange("csfloatApiKey", e.target.value)}
                            placeholder="Optional. Required if Feed is CSFloat..."
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>
                            <FaClock className={styles.inlineIcon} />
                            Cron Sync Interval (Minutes)
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="1440"
                            value={settings.syncIntervalMin}
                            onChange={(e) => handleChange("syncIntervalMin", parseInt(e.target.value) || 5)}
                            className={styles.input}
                        />
                        <p className={styles.helpText}>How rapidly the tracker updates asset values in the background.</p>
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
