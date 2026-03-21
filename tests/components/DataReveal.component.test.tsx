/**
 * @vitest-environment jsdom
 */
import "../setup-component";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DataReveal from "@/components/landing/DataReveal";

vi.mock("@/lib/gsap", () => ({
    gsap: {
        to: vi.fn((_obj, config) => {
            if (config.onComplete) config.onComplete();
            return { kill: vi.fn() };
        }),
    },
}));

let observeCalls: HTMLElement[] = [];

class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
    }
    observe(element: Element) {
        observeCalls.push(element as HTMLElement);
    }
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds = [];
}

beforeEach(() => {
    observeCalls = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("DataReveal Component", () => {
    it("renders with correct final value displayed", () => {
        render(<DataReveal value={1500} />);
        const container = screen.getByTestId("data-reveal");
        expect(container).toBeInTheDocument();
    });

    it("renders prefix correctly", () => {
        render(<DataReveal value={1000} prefix="$" />);
        expect(screen.getByText("$")).toBeInTheDocument();
    });

    it("renders suffix correctly", () => {
        render(<DataReveal value={100} suffix="%" />);
        expect(screen.getByText("%")).toBeInTheDocument();
    });

    it("renders both prefix and suffix together", () => {
        render(<DataReveal value={50} prefix="$" suffix="M" />);
        expect(screen.getByText("$")).toBeInTheDocument();
        expect(screen.getByText("M")).toBeInTheDocument();
    });

    it("shows value immediately when reduced motion is preferred", () => {
        const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === "(prefers-reduced-motion: reduce)",
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        vi.stubGlobal("matchMedia", mockMatchMedia);

        render(<DataReveal value={2500} />);
        expect(screen.getByText("2500")).toBeInTheDocument();
    });

    it("applies custom className", () => {
        render(<DataReveal value={100} className="custom-class" />);
        const container = screen.getByTestId("data-reveal");
        expect(container.className).toContain("custom-class");
    });

    it("initializes IntersectionObserver on mount", () => {
        render(<DataReveal value={500} />);
        expect(observeCalls.length).toBeGreaterThan(0);
    });
});
