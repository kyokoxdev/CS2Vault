/**
 * Market Provider Initialization
 *
 * Registers all available market data providers on startup.
 * Import this module once during app initialization.
 */

import { registerMarketProvider, clearProviders } from "@/lib/market/registry";
import { pricempireProvider } from "@/lib/market/pricempire";
import { csfloatProvider } from "@/lib/market/csfloat";
import { steamProvider } from "@/lib/market/steam";
import { csgotraderProvider } from "@/lib/market/csgotrader";
import { prisma } from "@/lib/db";
import { resolveMarketSource } from "@/lib/market/source";
import { decryptApiKey } from "@/lib/auth/api-keys";

let initialized = false;
let initializationSignature: string | null = null;

function buildInitializationSignature(activeMarketSource: string | null | undefined, hasCsfloatKey: boolean): string {
    return `${resolveMarketSource(activeMarketSource)}:${hasCsfloatKey ? "1" : "0"}:${process.env.PRICEMPIRE_API_KEY ? "1" : "0"}`;
}

export async function initializeMarketProviders(): Promise<void> {
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    const csfloatKey = decryptApiKey(settings?.csfloatApiKey) || process.env.CSFLOAT_API_KEY;
    const initializationKey = buildInitializationSignature(settings?.activeMarketSource, Boolean(csfloatKey));

    if (initialized && initializationSignature === initializationKey) {
        return;
    }

    clearProviders();

    // Register providers that have API keys configured
    const pricempireKey = process.env.PRICEMPIRE_API_KEY; // PRICEMPIRE is ENV only for now
    if (pricempireKey && settings?.activeMarketSource === "pricempire") {
        registerMarketProvider("pricempire", pricempireProvider);
        console.log("[Market] ✅ Pricempire provider registered");
    } else {
        console.warn("[Market] ⚠️ PRICEMPIRE_API_KEY not set — provider disabled");
    }

    if (csfloatKey) {
        registerMarketProvider("csfloat", csfloatProvider);
        console.log("[Market] ✅ CSFloat provider registered");
    } else {
        console.warn("[Market] ⚠️ CSFLOAT_API_KEY not set in DB or ENV — provider disabled");
    }

    // Steam doesn't require an API key for market price overview
    registerMarketProvider("steam", steamProvider);
    console.log("[Market] ✅ Steam provider registered (always available)");

    registerMarketProvider("csgotrader", csgotraderProvider);
    console.log("[Market] ✅ CSGOTrader provider registered (always available)");

    initializationSignature = initializationKey;
    initialized = true;
}

/**
 * Reset provider registry so next initializeMarketProviders() call
 * re-reads settings and re-registers providers.
 */
export async function resetProviders(): Promise<void> {
    clearProviders();
    initialized = false;
    initializationSignature = null;
    await initializeMarketProviders();
}
