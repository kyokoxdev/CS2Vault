/**
 * Unit Tests: Steam Price Parser
 */

import { describe, it, expect } from "vitest";
import { parseSteamPrice } from "@/lib/market/steam";

describe("parseSteamPrice", () => {
    it("parses standard USD format", () => {
        expect(parseSteamPrice("$12.34")).toBe(12.34);
    });

    it("parses price with commas as thousands separator", () => {
        expect(parseSteamPrice("$1,234.56")).toBe(1234.56);
    });

    it("parses European comma-decimal format", () => {
        expect(parseSteamPrice("12,34€")).toBe(12.34);
    });

    it("returns 0 for empty string", () => {
        expect(parseSteamPrice("")).toBe(0);
    });

    it("returns 0 for non-numeric", () => {
        expect(parseSteamPrice("N/A")).toBe(0);
    });

    it("parses price without currency symbol", () => {
        expect(parseSteamPrice("50.64")).toBe(50.64);
    });

    it("handles $0 fallback", () => {
        expect(parseSteamPrice("$0")).toBe(0);
    });

    it("parses large prices", () => {
        expect(parseSteamPrice("$15,000.00")).toBe(15000);
    });
});
