/** @vitest-environment jsdom */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "../setup-component";
import SteamLoginButton from "../../src/components/landing/SteamLoginButton";

describe("SteamLoginButton", () => {
    it("renders a link to /api/auth/steam/login", () => {
        render(<SteamLoginButton />);
        const link = screen.getByTestId("steam-login-button");
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("href", "/api/auth/steam/login");
    });

    it("displays official Valve Steam image", () => {
        render(<SteamLoginButton />);
        const img = screen.getByTestId("steam-login-image");
        expect(img.tagName).toBe("IMG");
        expect(img).toHaveAttribute("src", expect.stringContaining("steamcommunity-a.akamaihd.net"));
        expect(img).toHaveAttribute("alt", "Sign in through Steam");
    });
});
