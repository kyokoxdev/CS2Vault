/**
 * Unit Tests: Steam OpenID SteamID Extractor
 */

import { describe, it, expect } from "vitest";
import { extractSteamId } from "@/lib/auth/steam-openid";

describe("extractSteamId", () => {
    it("extracts SteamID64 from valid claimed_id (https)", () => {
        expect(
            extractSteamId("https://steamcommunity.com/openid/id/76561198012345678")
        ).toBe("76561198012345678");
    });

    it("extracts SteamID64 from valid claimed_id (http)", () => {
        expect(
            extractSteamId("http://steamcommunity.com/openid/id/76561198012345678")
        ).toBe("76561198012345678");
    });

    it("returns null for invalid URL", () => {
        expect(extractSteamId("https://example.com/123")).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(extractSteamId("")).toBeNull();
    });

    it("returns null for URL with extra path", () => {
        expect(
            extractSteamId("https://steamcommunity.com/openid/id/123/extra")
        ).toBeNull();
    });

    it("returns null for non-numeric ID", () => {
        expect(
            extractSteamId("https://steamcommunity.com/openid/id/abc")
        ).toBeNull();
    });
});
