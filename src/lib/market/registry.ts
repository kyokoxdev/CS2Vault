/**
 * Market Data Provider Interface & Registry
 * 
 * All market data providers (Pricempire, CSFloat, Steam) implement the
 * MarketDataProvider interface. The registry manages switching between them.
 */

import type { MarketDataProvider, MarketSource } from "@/types";

// Provider registry — populated by individual provider modules
const providers = new Map<MarketSource, MarketDataProvider>();

/**
 * Register a market data provider. Called during app initialization.
 */
export function registerMarketProvider(
    source: MarketSource,
    provider: MarketDataProvider
): void {
    providers.set(source, provider);
}

/**
 * Get the currently active market data provider based on app settings.
 */
export function getMarketProvider(source: MarketSource): MarketDataProvider {
    const provider = providers.get(source);
    if (!provider) {
        throw new Error(
            `Market provider "${source}" not registered. Available: ${[...providers.keys()].join(", ")}`
        );
    }
    return provider;
}

/**
 * Get all registered provider names.
 */
export function getAvailableProviders(): MarketSource[] {
    return [...providers.keys()];
}

/**
 * Resolve a market provider by source, returning null if not registered.
 * Unlike getMarketProvider, this does NOT throw — it logs a warning and returns null.
 */
export function resolveMarketProvider(source: MarketSource): MarketDataProvider | null {
    const provider = providers.get(source);
    if (!provider) {
        console.warn(`[Registry] Provider "${source}" not registered. Available: ${[...providers.keys()].join(", ")}`);
        return null;
    }
    return provider;
}

/**
 * Clear all registered providers. Used when settings change.
 */
export function clearProviders(): void {
    providers.clear();
}
