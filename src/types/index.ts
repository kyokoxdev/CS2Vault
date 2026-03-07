// ─── Market Data Types ──────────────────────────────────

export interface PriceData {
    price: number;         // USD
    volume?: number;       // 24h trade volume
    source: string;        // provider name or sub-provider name
    timestamp: Date;
}

export interface PricePoint {
    price: number;
    volume?: number;
    timestamp: Date;
}

export interface OHLCVCandle {
    time: number;          // Unix timestamp (seconds)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface ItemData {
    marketHashName: string;
    name: string;
    weapon?: string;
    skin?: string;
    category: string;
    rarity?: string;
    exterior?: string;
    imageUrl?: string;
}

// ─── Market Provider Types ──────────────────────────────

export interface RateLimitConfig {
    maxRequestsPerMinute: number;
    maxRequestsPerDay: number;
    minDelayMs: number;        // Minimum ms between requests
}

export interface MarketDataProvider {
    name: string;
    fetchItemPrice(marketHashName: string): Promise<PriceData>;
    fetchBulkPrices(items: string[]): Promise<Map<string, PriceData>>;
    fetchItemHistory?(marketHashName: string, days: number): Promise<PricePoint[]>;
    getRateLimitConfig(): RateLimitConfig;
}

// ─── AI Types ───────────────────────────────────────────

export interface ChatMessageData {
    role: "user" | "assistant" | "system";
    content: string;
    imageBase64?: string;
}

export interface MarketContext {
    topGainers: { name: string; changePercent: number; price: number }[];
    topLosers: { name: string; changePercent: number; price: number }[];
    portfolioSummary?: {
        totalValue: number;
        unrealizedPnL: number;
        itemCount: number;
    };
    inventory?: {
        name: string;
        quantity: number;
        currentPrice: number;
        acquiredPrice: number;
        pnl: number;
    }[];
    itemHistory?: Record<string, unknown[]>; // For general history if needed
    targetedItemData?: {
        name: string;
        currentPrice: number;
        history30Days: { date: string, price: number }[];
    };
    userQuery: string;
}

export interface AIProvider {
    name: string;
    requiresOAuth: boolean;
    isAuthenticated(): Promise<boolean>;
    chat(
        messages: ChatMessageData[],
        context: MarketContext
    ): AsyncGenerator<string>;
    getModelName(): string;
}

// ─── Portfolio Types ────────────────────────────────────

export interface PortfolioSummary {
    totalCurrentValue: number;
    totalAcquiredValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    itemCount: number;
    items: PortfolioItemSummary[];
}

export interface PortfolioItemSummary {
    id: string;
    name: string;
    imageUrl?: string;
    currentPrice: number;
    acquiredPrice?: number;
    pnl?: number;
    pnlPercent?: number;
    floatValue?: number;
}

// ─── Sync Types ─────────────────────────────────────────

export interface SyncResult {
    type: string;
    status: "success" | "failed" | "partial";
    itemCount: number;
    duration: number;
    error?: string;
    fallbackAvailable?: boolean;
    failureReason?: string;
    attemptedProvider?: string;
}

// ─── API Response Types ─────────────────────────────────

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ─── App Settings ───────────────────────────────────────

export type MarketSource = "pricempire" | "csfloat" | "csgotrader" | "steam";
export type AIProviderName = "gemini-pro" | "gemini-flash" | "openai";

export type CSGOTraderSubProvider = "csgotrader" | "bitskins" | "steam" | "csmoney" | "csgotm" | "lootfarm" | "skinport" | "csgoempire" | "swapgg" | "buff163" | "cstrade" | "csfloat" | "youpin" | "lisskins";

// CSGOTrader JSON format families
export interface CSGOTraderSimplePrice {
    price: number | null;
}

export interface CSGOTraderMultiModePrice {
    starting_at?: number | { price: number };
    highest_order?: { price: number };
    suggested_price?: number | null;
    instant_sale_price?: number;
    last_24h?: number;
    last_7d?: number;
    last_30d?: number;
    price?: number | null;
}

export interface AppSettingsData {
    activeMarketSource: MarketSource;
    csgotraderSubProvider?: CSGOTraderSubProvider;
    activeAIProvider: AIProviderName;
    syncIntervalMin: number;
    watchlistOnly: boolean;
    googleConnected: boolean;
}
