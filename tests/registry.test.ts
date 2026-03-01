import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketDataProvider, MarketSource } from "@/types";

function makeMockProvider(name: string): MarketDataProvider {
    return {
        name,
        fetchItemPrice: vi.fn(),
        fetchBulkPrices: vi.fn(),
        getRateLimitConfig: () => ({
            maxRequestsPerMinute: 10,
            maxRequestsPerDay: 100,
            minDelayMs: 1000,
        }),
    };
}

describe("Market Provider Registry", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    async function getRegistry() {
        return await import("@/lib/market/registry");
    }

    it("registerMarketProvider registers and can retrieve a provider", async () => {
        const registry = await getRegistry();
        const provider = makeMockProvider("Pricempire");

        registry.registerMarketProvider("pricempire", provider);

        expect(registry.getMarketProvider("pricempire")).toBe(provider);
    });

    it("getMarketProvider returns registered provider", async () => {
        const registry = await getRegistry();
        const provider = makeMockProvider("Steam");

        registry.registerMarketProvider("steam", provider);

        const result = registry.getMarketProvider("steam");
        expect(result).toBe(provider);
    });

    it("getMarketProvider throws a descriptive error when provider not registered", async () => {
        const registry = await getRegistry();

        expect(() => registry.getMarketProvider("csfloat")).toThrowError(
            'Market provider "csfloat" not registered. Available: '
        );
    });

    it("resolveMarketProvider returns provider when registered", async () => {
        const registry = await getRegistry();
        const provider = makeMockProvider("CSFloat");

        registry.registerMarketProvider("csfloat", provider);

        expect(registry.resolveMarketProvider("csfloat")).toBe(provider);
    });

    it("resolveMarketProvider returns null when not registered and warns", async () => {
        const registry = await getRegistry();
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const result = registry.resolveMarketProvider("csgotrader");

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            '[Registry] Provider "csgotrader" not registered. Available: '
        );
    });

    it("getAvailableProviders returns empty array when nothing registered", async () => {
        const registry = await getRegistry();

        expect(registry.getAvailableProviders()).toEqual([]);
    });

    it("getAvailableProviders returns all registered source names", async () => {
        const registry = await getRegistry();

        registry.registerMarketProvider("pricempire", makeMockProvider("Pricempire"));
        registry.registerMarketProvider("steam", makeMockProvider("Steam"));

        expect(registry.getAvailableProviders().sort()).toEqual(["pricempire", "steam"]);
    });

    it("supports multiple providers registered simultaneously", async () => {
        const registry = await getRegistry();

        const providerMap: Record<MarketSource, MarketDataProvider> = {
            pricempire: makeMockProvider("Pricempire"),
            csfloat: makeMockProvider("CSFloat"),
            csgotrader: makeMockProvider("CSGOTRader"),
            steam: makeMockProvider("Steam"),
        };

        Object.entries(providerMap).forEach(([source, provider]) => {
            registry.registerMarketProvider(source as MarketSource, provider);
        });

        (Object.keys(providerMap) as MarketSource[]).forEach((source) => {
            expect(registry.getMarketProvider(source)).toBe(providerMap[source]);
        });

        expect(registry.getAvailableProviders().sort()).toEqual(
            Object.keys(providerMap).sort()
        );
    });
});
