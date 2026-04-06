import { describe, expect, it } from "vitest";
import { selectPreferredMarketCapSource } from "@/lib/market/market-cap-display";

describe("selectPreferredMarketCapSource", () => {
    it("prefers fresh legacy market cap when it is available", () => {
        expect(
            selectPreferredMarketCapSource(
                {
                    totalMarketCap: 5_774_762_257,
                    provider: "csgotrader-csfloat",
                    status: "ok",
                },
                {
                    marketCapUsd: 5_100_000_000,
                    source: "csfloat",
                    status: "ok",
                }
            )
        ).toBe("legacy_fresh");
    });

    it("prefers live summary data when the legacy snapshot is stale", () => {
        expect(
            selectPreferredMarketCapSource(
                {
                    totalMarketCap: 5_774_762_257,
                    provider: "csgotrader-csfloat",
                    status: "stale",
                },
                {
                    marketCapUsd: 4_900_000_000,
                    source: "csfloat",
                    status: "ok",
                }
            )
        ).toBe("summary");
    });

    it("falls back to stale legacy data when no live summary is available", () => {
        expect(
            selectPreferredMarketCapSource(
                {
                    totalMarketCap: 5_774_762_257,
                    provider: "csgotrader-csfloat",
                    status: "stale",
                },
                null
            )
        ).toBe("legacy_stale");
    });

    it("returns none when neither source has a positive market cap", () => {
        expect(
            selectPreferredMarketCapSource(
                {
                    totalMarketCap: null,
                    provider: "csgotrader-csfloat",
                    status: "no_data",
                },
                {
                    marketCapUsd: null,
                    source: "csfloat",
                    status: "no_data",
                }
            )
        ).toBe("none");
    });
});
