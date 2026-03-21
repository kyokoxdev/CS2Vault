/** @vitest-environment jsdom */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import "../setup-component";
import { gsap } from "@/lib/gsap";
import HeroCinematic from "@/components/landing/HeroCinematic";
import StartupPage from "@/app/startup/page";

interface MockObserverRecord {
    callback: IntersectionObserverCallback;
    observed: Set<Element>;
    disconnectCalls: number;
}

const observerRecords: MockObserverRecord[] = [];
let reducedMotion = false;
let originalMatchMedia: typeof window.matchMedia;

function installMatchMediaMock() {
    originalMatchMedia = window.matchMedia;

    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
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

function installIntersectionObserverMock() {
    observerRecords.length = 0;

    class MockIntersectionObserver implements IntersectionObserver {
        readonly root = null;
        readonly rootMargin = "0px";
        readonly thresholds: ReadonlyArray<number> = [0];
        private readonly record: MockObserverRecord;

        constructor(callback: IntersectionObserverCallback) {
            this.record = {
                callback,
                observed: new Set<Element>(),
                disconnectCalls: 0,
            };
            observerRecords.push(this.record);
        }

        observe = (target: Element) => {
            this.record.observed.add(target);
        };

        unobserve = (target: Element) => {
            this.record.observed.delete(target);
        };

        disconnect = () => {
            this.record.disconnectCalls += 1;
            this.record.observed.clear();
        };

        takeRecords = () => [];
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
}

function triggerIntersection(target: Element, isIntersecting = true) {
    for (const record of observerRecords) {
        if (!record.observed.has(target)) {
            continue;
        }

        record.callback(
            [{ isIntersecting, target } as IntersectionObserverEntry],
            {} as IntersectionObserver
        );
    }
}

function killAllGsapAnimations() {
    const animations = gsap.globalTimeline.getChildren(true, true, true);
    for (const animation of animations) {
        animation.kill();
    }
}

describe("Landing animations integration", () => {
    beforeEach(() => {
        reducedMotion = false;
        installMatchMediaMock();
        installIntersectionObserverMock();
    });

    afterEach(() => {
        killAllGsapAnimations();
        window.matchMedia = originalMatchMedia;
        vi.restoreAllMocks();
    });

    it("runs hero GSAP timeline and keeps duration within 5 seconds", async () => {
        const createdTimelines: gsap.core.Timeline[] = [];
        const originalTimeline = gsap.timeline.bind(gsap);

        vi.spyOn(gsap, "timeline").mockImplementation(((vars?: gsap.TimelineVars) => {
            const timeline = originalTimeline(vars);
            createdTimelines.push(timeline);
            return timeline;
        }) as typeof gsap.timeline);

        render(React.createElement(HeroCinematic));

        await waitFor(() => {
            expect(createdTimelines.length).toBeGreaterThan(0);
        });

        const heroTimeline = createdTimelines[0];

        expect(heroTimeline.totalDuration()).toBeLessThanOrEqual(5);
        expect(heroTimeline.getChildren(false, true, true).length).toBeGreaterThan(0);

        const cta = screen.getByTestId("hero-cta");
        act(() => {
            heroTimeline.progress(1);
        });

        expect(Number(gsap.getProperty(cta, "opacity"))).toBeGreaterThan(0.9);
    });

    it("disables counter animations when reduced motion is enabled", async () => {
        reducedMotion = true;
        const gsapToSpy = vi.spyOn(gsap, "to");

        render(React.createElement(HeroCinematic));

        await waitFor(() => {
            expect(screen.getByTestId("parallax-section").className).toContain("reducedMotion");
        });

        const counters = screen.getAllByTestId("data-reveal");

        act(() => {
            for (const counter of counters) {
                triggerIntersection(counter, true);
            }
        });

        expect(gsapToSpy).not.toHaveBeenCalled();
        expect(screen.getByText("2.5")).toBeDefined();
        expect(screen.getByText("50")).toBeDefined();
        expect(screen.getByText("24")).toBeDefined();
    });

    it("fires scroll-triggered DataReveal animations through IntersectionObserver", async () => {
        const gsapToSpy = vi.spyOn(gsap, "to");

        render(React.createElement(HeroCinematic));

        const counters = screen.getAllByTestId("data-reveal");
        expect(gsapToSpy).not.toHaveBeenCalled();

        act(() => {
            for (const counter of counters) {
                triggerIntersection(counter, true);
            }
        });

        await waitFor(() => {
            expect(gsapToSpy).toHaveBeenCalledTimes(3);
        });

        const durations = gsapToSpy.mock.calls.map(([, vars]) => Number((vars as gsap.TweenVars).duration));
        expect(durations.every((duration) => duration === 1.2)).toBe(true);
    });

    it("reveals ScrollReveal wrappers when they intersect viewport", async () => {
        render(React.createElement(StartupPage));

        const revealWrappers = screen.getAllByTestId("scroll-reveal");
        const firstReveal = revealWrappers[0];

        expect(firstReveal.className).not.toContain("revealed");

        act(() => {
            triggerIntersection(firstReveal, true);
        });

        await waitFor(() => {
            expect(firstReveal.className).toContain("revealed");
        });
    });
});
