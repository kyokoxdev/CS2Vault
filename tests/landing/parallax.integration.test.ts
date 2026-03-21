/** @vitest-environment jsdom */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../setup-component";
import ParallaxSection from "@/components/landing/ParallaxSection";

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

function getScale(transform: string): number {
    const match = /scale\(([^)]+)\)/.exec(transform);
    return match ? Number(match[1]) : 1;
}

describe("Parallax 3D integration", () => {
    beforeEach(() => {
        originalMatchMedia = window.matchMedia;
        setReducedMotion(false);
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        vi.restoreAllMocks();
    });

    it("applies CSS 3D transform strings to parallax layers", () => {
        const layers = [
            { content: React.createElement("div", undefined, "Back"), depth: 1 as const, speed: 0.8 },
            { content: React.createElement("div", undefined, "Mid"), depth: 2 as const, speed: 0.6 },
            { content: React.createElement("div", undefined, "Front"), depth: 3 as const, speed: 1 },
        ];

        render(React.createElement(ParallaxSection, { layers }));

        const backLayer = screen.getByTestId("parallax-layer-1");
        const midLayer = screen.getByTestId("parallax-layer-2");
        const frontLayer = screen.getByTestId("parallax-layer-3");

        expect(backLayer.style.transform).toContain("translateZ(");
        expect(backLayer.style.transform).toContain("scale(");
        expect(midLayer.style.transform).toContain("translateZ(");
        expect(midLayer.style.transform).toContain("scale(");
        expect(frontLayer.style.transform).toBe("translateZ(0px) scale(1)");
    });

    it("keeps transforms depth-only and bounded to avoid horizontal overflow growth", () => {
        const layers = [
            { content: React.createElement("div", undefined, "L1"), depth: 1 as const, speed: 1 },
            { content: React.createElement("div", undefined, "L2"), depth: 2 as const, speed: 1 },
        ];

        render(React.createElement(ParallaxSection, { layers }));

        const container = screen.getByTestId("parallax-section");
        const layer1 = screen.getByTestId("parallax-layer-1");
        const layer2 = screen.getByTestId("parallax-layer-2");

        const transform1 = layer1.style.transform;
        const transform2 = layer2.style.transform;

        expect(container.className).toContain("container");
        expect(transform1).not.toContain("translateX(");
        expect(transform2).not.toContain("translateX(");
        expect(getScale(transform1)).toBeLessThanOrEqual(1.1);
        expect(getScale(transform2)).toBeLessThanOrEqual(1.1);
    });

    it("removes transforms entirely when reduced motion is enabled", () => {
        setReducedMotion(true);

        const layers = [
            { content: React.createElement("div", undefined, "Layer"), depth: 1 as const, speed: 0.5 },
        ];

        render(React.createElement(ParallaxSection, { layers }));

        const layer = screen.getByTestId("parallax-layer-1");
        expect(layer.style.transform).toBe("");
    });
});
