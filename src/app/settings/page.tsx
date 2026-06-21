"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import styles from "./Settings.module.css";
import { FaSave, FaRobot, FaChartLine, FaClock, FaSyncAlt, FaServer } from "react-icons/fa";
import { AI_MODELS } from "@/lib/ai/model-labels";
import { Select } from "@/components/ui/Select";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import { UI_THEMES, isUiTheme, type UiTheme } from "@/lib/ui/preferences";

interface AppSettings {
    activeMarketSource: string;
    activeAIProvider: string;
    priceRefreshIntervalMin: number;
    openAiApiKey: string;
    geminiApiKey: string;
    anthropicApiKey: string;
    openRouterApiKey: string;
    nineRouterApiKey: string;
    csfloatApiKey: string;
    csgotraderSubProvider: string;
    inngestEventKey?: string;
    inngestSigningKey?: string;
}

const API_KEY_FIELDS = ["openAiApiKey", "geminiApiKey", "anthropicApiKey", "openRouterApiKey", "nineRouterApiKey", "csfloatApiKey", "inngestEventKey", "inngestSigningKey"] as const;
type ApiKeyField = typeof API_KEY_FIELDS[number];
const SAVED_KEY_INDICATOR = "••••••••••••••••";

const EMPTY_API_KEYS: Record<ApiKeyField, string> = {
    openAiApiKey: "",
    geminiApiKey: "",
    anthropicApiKey: "",
    openRouterApiKey: "",
    nineRouterApiKey: "",
    csfloatApiKey: "",
    inngestEventKey: "",
    inngestSigningKey: "",
};

const AI_KEY_INPUTS: { field: ApiKeyField; id: string; label: string; placeholder: string; help: string }[] = [
    {
        field: "geminiApiKey",
        id: "settings-gemini-key",
        label: "Google Gemini API Key",
        placeholder: "AIzaSy...",
        help: "Used by Gemini Flash for text and image-aware market chats.",
    },
    {
        field: "openAiApiKey",
        id: "settings-openai-key",
        label: "OpenAI API Key",
        placeholder: "sk-...",
        help: "Used by the OpenAI route; OPENAI_MODEL can override the default GPT-4o Mini model.",
    },
    {
        field: "anthropicApiKey",
        id: "settings-anthropic-key",
        label: "Anthropic API Key",
        placeholder: "sk-ant-...",
        help: "Used by Claude Opus with adaptive thinking for deeper market reasoning.",
    },
    {
        field: "openRouterApiKey",
        id: "settings-openrouter-key",
        label: "OpenRouter API Key",
        placeholder: "sk-or-...",
        help: "Routes through https://openrouter.ai/api/v1 by default; override with OPENROUTER_MODEL if needed.",
    },
    {
        field: "nineRouterApiKey",
        id: "settings-ninerouter-key",
        label: "9Router API Key",
        placeholder: "Optional for local 9Router auth",
        help: "Targets a local OpenAI-compatible 9Router gateway; set NINEROUTER_BASE_URL when not using localhost.",
    },
];

const THEME_LABELS: Record<UiTheme, string> = {
    dark: "Dark",
    "high-contrast": "High Contrast",
};

const THEME_OPTIONS = UI_THEMES.map((theme) => ({ label: THEME_LABELS[theme], value: theme }));

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [refreshingMarketCap, setRefreshingMarketCap] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [savedKeyMasks, setSavedKeyMasks] = useState<Record<string, string>>({});
    const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
    const { preferences, updatePreferences } = useUiPreferences();

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
                    ...EMPTY_API_KEYS,
                });
            })
            .catch(err => console.error("Failed to load settings:", err));
    }, []);

    const handleChange = (field: keyof AppSettings, value: string | number) => {
        if (!settings) return;
        setSettings({ ...settings, [field]: value });
    };

    const handleThemePreferenceChange = (value: string) => {
        if (isUiTheme(value)) {
            updatePreferences({ theme: value });
        }
    };

    const handleMarketTapePreferenceChange = (event: ChangeEvent<HTMLInputElement>) => {
        updatePreferences({ marketTapeVisible: event.target.checked });
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
                ...EMPTY_API_KEYS,
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
        return <div className={styles.loading} data-testid="route-settings">Loading configuration...</div>;
    }

    return (
        <div className={styles.container} data-testid="route-settings">
            <header className={styles.header}>
                <div className={styles.headerCopy}>
                    <p className={styles.eyebrow}>Operations and preferences</p>
                    <h1 className={styles.title}>Settings</h1>
                    <p className={styles.subtitle}>Manage provider credentials, refresh cadence, and the dashboard theme from one place.</p>
                </div>
                <dl className={styles.headerStats}>
                    <div className={styles.statCard}>
                        <dt>Active AI</dt>
                        <dd>{AI_MODELS.find((model) => model.value === settings.activeAIProvider)?.shortLabel ?? settings.activeAIProvider}</dd>
                    </div>
                    <div className={styles.statCard}>
                        <dt>Price refresh</dt>
                        <dd>{settings.priceRefreshIntervalMin} min</dd>
                    </div>
                    <div className={styles.statCard}>
                        <dt>Primary feed</dt>
                        <dd>{settings.activeMarketSource}</dd>
                    </div>
                </dl>
            </header>

            <div className={styles.grid}>
                <section className={`${styles.panel} ${styles.interfacePanel}`}>
                    <div className={styles.panelHeader}>
                        <FaChartLine className={styles.icon} />
                        <div>
                            <h2>Interface Preferences</h2>
                            <p className={styles.panelKicker}>Theme selection</p>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-ui-theme" data-testid="preferences-theme-select">Theme</label>
                        <Select
                            id="settings-ui-theme"
                            value={preferences.theme}
                            onChange={handleThemePreferenceChange}
                            className={styles.select}
                            options={THEME_OPTIONS}
                        />
                        <p className={styles.helpText}>Choose the standard dark palette or a higher-contrast mode for the dashboard.</p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-market-tape">
                            <input
                                id="settings-market-tape"
                                type="checkbox"
                                checked={preferences.marketTapeVisible}
                                onChange={handleMarketTapePreferenceChange}
                                data-testid="preferences-market-tape-toggle"
                            />
                            Market tape
                        </label>
                        <p className={styles.helpText}>Show the moving top-movers tape in the dashboard header.</p>
                    </div>
                </section>

                {/* AI Agents Panel */}
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <FaRobot className={styles.icon} />
                        <div>
                            <h2>AI Market Agent</h2>
                            <p className={styles.panelKicker}>Model routing and credential vault</p>
                        </div>
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

                    {AI_KEY_INPUTS.map((input) => (
                        <div className={styles.formGroup} key={input.field}>
                            <label htmlFor={input.id}>{input.label}</label>
                            <input
                                id={input.id}
                                type="password"
                                value={getKeyDisplayValue(input.field)}
                                onChange={(e) => handleKeyChange(input.field, e.target.value)}
                                onFocus={() => handleKeyFocus(input.field)}
                                onBlur={() => handleKeyBlur(input.field)}
                                placeholder={input.placeholder}
                                className={styles.input}
                            />
                            <p className={styles.helpText}>{input.help}</p>
                        </div>
                    ))}
                </section>

                {/* Market Data Panel */}
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <FaChartLine className={styles.icon} />
                        <div>
                            <h2>Market Data Source</h2>
                            <p className={styles.panelKicker}>Live feed controls and recalculation actions</p>
                        </div>
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

                {/* Aegis & Inngest Panel */}
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <FaServer className={styles.icon} />
                        <div>
                            <h2>Aegis & Inngest Integration</h2>
                            <p className={styles.panelKicker}>Credentials for event processing and pipeline</p>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-inngest-event-key">Inngest Event Key</label>
                        <input
                            id="settings-inngest-event-key"
                            type="password"
                            value={getKeyDisplayValue("inngestEventKey")}
                            onChange={(e) => handleKeyChange("inngestEventKey", e.target.value)}
                            onFocus={() => handleKeyFocus("inngestEventKey")}
                            onBlur={() => handleKeyBlur("inngestEventKey")}
                            placeholder="Optional. Required for dispatching Aegis runs..."
                            className={styles.input}
                        />
                        <p className={styles.helpText}>Used to publish events from CS2Vault to your Inngest platform.</p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="settings-inngest-signing-key">Inngest Signing Key</label>
                        <input
                            id="settings-inngest-signing-key"
                            type="password"
                            value={getKeyDisplayValue("inngestSigningKey")}
                            onChange={(e) => handleKeyChange("inngestSigningKey", e.target.value)}
                            onFocus={() => handleKeyFocus("inngestSigningKey")}
                            onBlur={() => handleKeyBlur("inngestSigningKey")}
                            placeholder="Optional. Required for endpoint request verification..."
                            className={styles.input}
                        />
                        <p className={styles.helpText}>Used to authenticate incoming webhooks and function execution requests from Inngest.</p>
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
