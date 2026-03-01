import { describe, it, expect } from "vitest";

import {
    parseSimplePriceFormat,
    parseKeyValueFormat,
    parseMultiModeFormat,
    PROVIDER_FORMAT_MAP,
} from "@/lib/market/csgotrader-parsers";

describe("csgotrader parsers", () => {
    describe("parseSimplePriceFormat", () => {
        it("parses valid prices and filters invalid values", () => {
            const data: Record<string, { price: number | null }> = {
                "AK-47 | Redline": { price: 12.5 },
                "M4A1-S | Nitro": { price: 4.2 },
                "Null Price": { price: null },
                "Zero Price": { price: 0 },
                "Negative Price": { price: -5 },
                "NaN Price": { price: Number.NaN },
                "Infinity Price": { price: Number.POSITIVE_INFINITY },
            };

            const result = parseSimplePriceFormat(data);

            expect(Array.from(result.entries())).toEqual([
                ["AK-47 | Redline", 12.5],
                ["M4A1-S | Nitro", 4.2],
            ]);
        });

        it("returns empty map for empty input", () => {
            expect(parseSimplePriceFormat({})).toEqual(new Map());
        });
    });

    describe("parseKeyValueFormat", () => {
        it("parses valid key/value prices and filters invalid values", () => {
            const data: Record<string, number> = {
                "AWP | Asiimov": 99.99,
                "Glock-18 | Fade": 250,
                "Zero Price": 0,
                "Negative Price": -2,
                "NaN Price": Number.NaN,
                "Infinity Price": Number.POSITIVE_INFINITY,
            };

            const result = parseKeyValueFormat(data);

            expect(Array.from(result.entries())).toEqual([
                ["AWP | Asiimov", 99.99],
                ["Glock-18 | Fade", 250],
            ]);
        });

        it("returns empty map for empty input", () => {
            expect(parseKeyValueFormat({})).toEqual(new Map());
        });
    });

    describe("parseMultiModeFormat", () => {
        it("parses last_24h mode and filters invalid values", () => {
            const data: Record<string, unknown> = {
                "Valid 1": { last_24h: 10 },
                "Valid 2": { last_24h: 25.5 },
                "Zero": { last_24h: 0 },
                "NaN": { last_24h: Number.NaN },
                "Missing": { price: 12 },
                "NonRecord": "oops",
            };

            const result = parseMultiModeFormat(data, "last_24h");

            expect(Array.from(result.entries())).toEqual([
                ["Valid 1", 10],
                ["Valid 2", 25.5],
            ]);
        });

        it("parses price mode", () => {
            const data: Record<string, unknown> = {
                "Valid": { price: 6.5 },
                "Null": { price: null },
                "Negative": { price: -4 },
            };

            const result = parseMultiModeFormat(data, "price");

            expect(Array.from(result.entries())).toEqual([["Valid", 6.5]]);
        });

        it("parses starting_at mode for nested and direct values", () => {
            const data: Record<string, unknown> = {
                "Nested": { starting_at: { price: 15 } },
                "Direct": { starting_at: 7 },
                "Invalid Nested": { starting_at: { price: 0 } },
                "Null": { starting_at: null },
            };

            const result = parseMultiModeFormat(data, "starting_at");

            expect(Array.from(result.entries())).toEqual([
                ["Nested", 15],
                ["Direct", 7],
            ]);
        });

        it("parses highest_order mode", () => {
            const data: Record<string, unknown> = {
                "Valid": { highest_order: { price: 22 } },
                "Invalid": { highest_order: { price: 0 } },
                "NotObject": { highest_order: 5 },
            };

            const result = parseMultiModeFormat(data, "highest_order");

            expect(Array.from(result.entries())).toEqual([["Valid", 22]]);
        });

        it("parses suggested_price mode", () => {
            const data: Record<string, unknown> = {
                "Valid": { suggested_price: 18 },
                "Null": { suggested_price: null },
                "Negative": { suggested_price: -3 },
            };

            const result = parseMultiModeFormat(data, "suggested_price");

            expect(Array.from(result.entries())).toEqual([["Valid", 18]]);
        });

        it("parses instant_sale_price mode", () => {
            const data: Record<string, unknown> = {
                "Valid": { instant_sale_price: 30 },
                "Infinity": { instant_sale_price: Number.POSITIVE_INFINITY },
                "Zero": { instant_sale_price: 0 },
            };

            const result = parseMultiModeFormat(data, "instant_sale_price");

            expect(Array.from(result.entries())).toEqual([["Valid", 30]]);
        });
    });

    describe("PROVIDER_FORMAT_MAP", () => {
        it("contains all 14 sub-providers", () => {
            const providers = Object.keys(PROVIDER_FORMAT_MAP).sort();
            expect(providers).toEqual([
                "bitskins",
                "buff163",
                "csfloat",
                "csgoempire",
                "csgotm",
                "csgotrader",
                "csmoney",
                "cstrade",
                "lisskins",
                "lootfarm",
                "skinport",
                "steam",
                "swapgg",
                "youpin",
            ]);
        });

        it("maps providers to correct parser and default modes", () => {
            expect(PROVIDER_FORMAT_MAP.csgotrader).toEqual({ parser: "simple" });
            expect(PROVIDER_FORMAT_MAP.csfloat).toEqual({ parser: "simple" });
            expect(PROVIDER_FORMAT_MAP.csmoney).toEqual({ parser: "simple" });
            expect(PROVIDER_FORMAT_MAP.cstrade).toEqual({ parser: "simple" });
            expect(PROVIDER_FORMAT_MAP.lisskins).toEqual({ parser: "simple" });

            expect(PROVIDER_FORMAT_MAP.lootfarm).toEqual({ parser: "keyvalue" });
            expect(PROVIDER_FORMAT_MAP.csgotm).toEqual({ parser: "keyvalue" });
            expect(PROVIDER_FORMAT_MAP.csgoempire).toEqual({ parser: "keyvalue" });
            expect(PROVIDER_FORMAT_MAP.swapgg).toEqual({ parser: "keyvalue" });
            expect(PROVIDER_FORMAT_MAP.youpin).toEqual({ parser: "keyvalue" });

            expect(PROVIDER_FORMAT_MAP.steam).toEqual({
                parser: "multimode",
                defaultMode: "last_24h",
            });
            expect(PROVIDER_FORMAT_MAP.bitskins).toEqual({
                parser: "multimode",
                defaultMode: "price",
            });
            expect(PROVIDER_FORMAT_MAP.skinport).toEqual({
                parser: "multimode",
                defaultMode: "starting_at",
            });
            expect(PROVIDER_FORMAT_MAP.buff163).toEqual({
                parser: "multimode",
                defaultMode: "starting_at",
            });
        });
    });
});
