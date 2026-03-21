/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../setup-component";
import ParallaxSection from "../../src/components/landing/ParallaxSection";

describe("ParallaxSection", () => {
    beforeEach(() => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it("renders the correct number of layers", () => {
        const layers = [
            { content: <div>Layer 1</div>, depth: 1 as const },
            { content: <div>Layer 2</div>, depth: 2 as const },
            { content: <div>Layer 3</div>, depth: 3 as const },
        ];

        render(<ParallaxSection layers={layers} />);

        expect(screen.getByTestId("parallax-layer-1")).toBeInTheDocument();
        expect(screen.getByTestId("parallax-layer-2")).toBeInTheDocument();
        expect(screen.getByTestId("parallax-layer-3")).toBeInTheDocument();
    });

    it("renders single layer correctly", () => {
        const layers = [{ content: <span>Single</span>, depth: 2 as const }];

        render(<ParallaxSection layers={layers} />);

        expect(screen.getByTestId("parallax-layer-2")).toBeInTheDocument();
        expect(screen.getByText("Single")).toBeInTheDocument();
    });

    it("renders children in content wrapper", () => {
        const layers = [{ content: <div>BG</div>, depth: 1 as const }];

        render(
            <ParallaxSection layers={layers}>
                <p>Foreground content</p>
            </ParallaxSection>
        );

        expect(screen.getByTestId("parallax-content")).toBeInTheDocument();
        expect(screen.getByText("Foreground content")).toBeInTheDocument();
    });

    it("has container class which applies overflow hidden", () => {
        const layers = [{ content: <div>Test</div>, depth: 1 as const }];

        render(<ParallaxSection layers={layers} />);

        const container = screen.getByTestId("parallax-section");
        expect(container.className).toContain("container");
    });

    it("disables transforms when prefers-reduced-motion is enabled", () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: query === "(prefers-reduced-motion: reduce)",
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        const layers = [
            { content: <div>Layer 1</div>, depth: 1 as const },
            { content: <div>Layer 2</div>, depth: 2 as const },
        ];

        render(<ParallaxSection layers={layers} />);

        const layer1 = screen.getByTestId("parallax-layer-1");
        const layer2 = screen.getByTestId("parallax-layer-2");

        expect(layer1.style.transform).toBe("");
        expect(layer2.style.transform).toBe("");
    });

    it("applies transforms when motion is allowed", () => {
        const layers = [
            { content: <div>Layer 1</div>, depth: 1 as const, speed: 1 },
            { content: <div>Layer 2</div>, depth: 2 as const, speed: 0.5 },
        ];

        render(<ParallaxSection layers={layers} />);

        const layer1 = screen.getByTestId("parallax-layer-1");
        const layer2 = screen.getByTestId("parallax-layer-2");

        expect(layer1.style.transform).toContain("translateZ");
        expect(layer2.style.transform).toContain("translateZ");
    });

    it("accepts custom className", () => {
        const layers = [{ content: <div>Test</div>, depth: 1 as const }];

        render(<ParallaxSection layers={layers} className="custom-class" />);

        const container = screen.getByTestId("parallax-section");
        expect(container.className).toContain("custom-class");
    });

    it("sets data-depth attribute on layers", () => {
        const layers = [
            { content: <div>L1</div>, depth: 1 as const },
            { content: <div>L2</div>, depth: 2 as const },
            { content: <div>L3</div>, depth: 3 as const },
        ];

        render(<ParallaxSection layers={layers} />);

        expect(screen.getByTestId("parallax-layer-1")).toHaveAttribute("data-depth", "1");
        expect(screen.getByTestId("parallax-layer-2")).toHaveAttribute("data-depth", "2");
        expect(screen.getByTestId("parallax-layer-3")).toHaveAttribute("data-depth", "3");
    });
});
