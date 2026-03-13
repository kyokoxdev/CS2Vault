"use client";

import { useState, useEffect } from "react";
import styles from "./Settings.module.css";
import { FaSave, FaRobot, FaChartLine, FaClock } from "react-icons/fa";
import { AI_MODELS } from "@/lib/ai/model-labels";
import { Select } from "@/components/ui/Select";

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
                        <Select
                            value={settings.activeAIProvider}
                            onChange={(val) => handleChange("activeAIProvider", val)}
                            className={styles.select}
                            options={AI_MODELS.map(model => ({ label: model.label, value: model.value }))}
                        />
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
                        <Select
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
                            <label>Sub-Provider</label>
                            <Select
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
