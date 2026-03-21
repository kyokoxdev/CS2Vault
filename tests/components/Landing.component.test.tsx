/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../setup-component";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/startup",
    useSearchParams: () => new URLSearchParams(),
}));

const mockIntersectionObserver = vi.fn(function(this: unknown, callback: IntersectionObserverCallback) {
    return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
    };
});
vi.stubGlobal("IntersectionObserver", mockIntersectionObserver);

import StartupPage from "@/app/startup/page";

describe("Landing Page", () => {
    it("renders all sections with correct data-testid", () => {
        render(<StartupPage />);
        expect(screen.getByTestId("landing-page")).toBeDefined();
        expect(screen.getByTestId("hero-cinematic")).toBeDefined();
        expect(screen.getByTestId("features-section")).toBeDefined();
        expect(screen.getByTestId("how-it-works-section")).toBeDefined();
        expect(screen.getByTestId("cta-section")).toBeDefined();
        expect(screen.getByTestId("landing-footer")).toBeDefined();
    });

    it("renders hero heading", () => {
        render(<StartupPage />);
        expect(screen.getByText(/Your CS2 Market/)).toBeDefined();
        expect(screen.getByText("Intelligence Hub")).toBeDefined();
    });

    it("renders Steam login button with correct href", () => {
        render(<StartupPage />);
        const buttons = screen.getAllByTestId("steam-login-button");
        expect(buttons.length).toBe(2);
        buttons.forEach(button => {
            expect(button.getAttribute("href")).toBe("/api/auth/steam/login");
        });
    });

    it("renders footer with Valve trademark text", () => {
        render(<StartupPage />);
        const footer = screen.getByTestId("landing-footer");
        expect(footer.textContent).toContain("Valve Corporation");
        expect(footer.textContent).toContain("trademarks");
    });

    it("renders How It Works steps", () => {
        render(<StartupPage />);
        expect(screen.getByText("Sign In with Steam")).toBeDefined();
        expect(screen.getByText("Import Your Inventory")).toBeDefined();
        expect(screen.getByText(/Track.*Analyze/)).toBeDefined();
    });

    it("renders CTA heading", () => {
        render(<StartupPage />);
        expect(screen.getByText("Ready to Level Up Your Trading?")).toBeDefined();
    });
});
