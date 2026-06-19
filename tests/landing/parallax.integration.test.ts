/** @vitest-environment jsdom */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../setup-component";
import LayeredSection from "@/components/landing/LayeredSection";

let originalMatchMedia: typeof window.matchMedia;

function setReducedMotion(enabled: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === "(prefers-reduced-motion: reduce)" ? enabled : false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

describe("Layered landing integration", () => {
    beforeEach(() => {
        originalMatchMedia = window.matchMedia;
        setReducedMotion(false);
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        vi.restoreAllMocks();
    });

    it("renders layered sections without inline transforms", () => {
        const layers = [
            { content: React.createElement("div", undefined, "Back"), depth: 1 as const, speed: 0.8 },
            { content: React.createElement("div", undefined, "Mid"), depth: 2 as const, speed: 0.6 },
            { content: React.createElement("div", undefined, "Front"), depth: 3 as const, speed: 1 },
        ];

        render(React.createElement(LayeredSection, { layers }));

        const backLayer = screen.getByTestId("layered-layer-1");
        const midLayer = screen.getByTestId("layered-layer-2");
        const frontLayer = screen.getByTestId("layered-layer-3");

        expect(backLayer.style.transform).toBe("");
        expect(midLayer.style.transform).toBe("");
        expect(frontLayer.style.transform).toBe("");
    });

    it("keeps depth metadata without adding transform chrome", () => {
        const layers = [
            { content: React.createElement("div", undefined, "L1"), depth: 1 as const, speed: 1 },
            { content: React.createElement("div", undefined, "L2"), depth: 2 as const, speed: 1 },
        ];

        render(React.createElement(LayeredSection, { layers }));

        const container = screen.getByTestId("layered-section");
        const layer1 = screen.getByTestId("layered-layer-1");
        const layer2 = screen.getByTestId("layered-layer-2");

        expect(container.className).toContain("container");
        expect(layer1).toHaveAttribute("data-depth", "1");
        expect(layer2).toHaveAttribute("data-depth", "2");
    });

    it("removes transforms entirely when reduced motion is enabled", () => {
        setReducedMotion(true);

        const layers = [
            { content: React.createElement("div", undefined, "Layer"), depth: 1 as const, speed: 0.5 },
        ];

        render(React.createElement(LayeredSection, { layers }));

        const layer = screen.getByTestId("layered-layer-1");
        expect(layer.style.transform).toBe("");
    });
});
