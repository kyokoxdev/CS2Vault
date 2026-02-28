/**
 * Market Provider Initialization
 *
 * Registers all available market data providers on startup.
 * Import this module once during app initialization.
 */

import { registerMarketProvider } from "@/lib/market/registry";
import { pricempireProvider } from "@/lib/market/pricempire";
import { csfloatProvider } from "@/lib/market/csfloat";
import { steamProvider } from "@/lib/market/steam";
import { csgotraderProvider } from "@/lib/market/csgotrader";
import { prisma } from "@/lib/db";

let initialized = false;

export async function initializeMarketProviders(): Promise<void> {
    if (initialized) return;

    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

    // Register providers that have API keys configured
    const pricempireKey = process.env.PRICEMPIRE_API_KEY; // PRICEMPIRE is ENV only for now
    if (pricempireKey) {
        registerMarketProvider("pricempire", pricempireProvider);
        console.log("[Market] ✅ Pricempire provider registered");
    } else {
        console.warn("[Market] ⚠️ PRICEMPIRE_API_KEY not set — provider disabled");
    }

    const csfloatKey = settings?.csfloatApiKey || process.env.CSFLOAT_API_KEY;
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

    initialized = true;
}
