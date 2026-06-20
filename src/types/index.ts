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

export interface BulkPriceFetchOptions {
    /** When true, only use fast bulk/CDN paths — skip individual API calls for missing items. */
    bulkOnly?: boolean;
}

export interface MarketDataProvider {
    name: string;
    fetchItemPrice(marketHashName: string): Promise<PriceData>;
    fetchBulkPrices(items: string[], options?: BulkPriceFetchOptions): Promise<Map<string, PriceData>>;
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
    marketOverview?: {
        totalMarketCap: number;
        trackedItemCount: number;
        watchlistCount: number;
        priceSource: string;
        lastSyncAge?: string;
    };
    portfolioSummary?: {
        totalValue: number;
        unrealizedPnL: number;
        realizedPnL: number;
        itemCount: number;
        soldCount: number;
    };
    inventory?: {
        name: string;
        quantity: number;
        currentPrice: number;
        acquiredPrice: number;
        pnl: number;
        rarity?: string;
        exterior?: string;
    }[];
    watchlist?: {
        name: string;
        currentPrice: number;
        changePercent: number;
        rarity?: string;
    }[];
    watchlistAction?: {
        status: "added" | "already_watched" | "not_found" | "failed";
        itemName?: string;
        message: string;
    };
    soldItems?: {
        name: string;
        acquiredPrice: number;
        soldPrice: number;
        realizedPnl: number;
        soldAt: string;
    }[];
    contextError?: boolean;
    targetedItemData?: {
        name: string;
        currentPrice: number;
        rarity?: string;
        exterior?: string;
        category?: string;
        historyDaily: { date: string, price: number }[];
        historyWindowDays: number;
        allHistoryPoints: number;
        oldestHistoryDate?: string;
        latestHistoryDate?: string;
        ohlcvDaily?: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
        ohlcvWindowDays?: number;
    };
    researchPacket?: {
        generatedAt: string;
        retrievalMode: string;
        coverage: string[];
        currentPricingSignals: string[];
        historicalSignals: string[];
        dataLimits: string[];
    };
    newsHeadlines?: {
        title: string;
        source: string;
        date: string;
    }[];
    aegisMemories?: {
        title: string;
        content: string;
        kind: string;
        tags: string[];
    }[];
    userQuery: string;
    referencedSessionContext?: string;
}

export type AIReasoningDepth = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type AIAgentMode = "consultant" | "researcher";
export type AIAgentStage = "researcher" | "consultant-final";

export interface AIChatOptions {
    reasoningDepth?: AIReasoningDepth;
    agentMode: AIAgentMode;
    agentStage?: AIAgentStage;
    delegatedResearch?: string;
    openRouterModelId?: string;
    deepResearch?: boolean;
    deepResearchBlock?: string;
}

export interface AIProvider {
    name: string;
    requiresOAuth: boolean;
    isAuthenticated(): Promise<boolean>;
    chat(
        messages: ChatMessageData[],
        context: MarketContext,
        options: AIChatOptions
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
export type AIProviderName = "gemini-flash" | "openai" | "anthropic" | "openrouter" | "9router";

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
    watchlistOnly: boolean;
    googleConnected: boolean;
}
