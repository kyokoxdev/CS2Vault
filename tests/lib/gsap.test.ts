/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import gsap from "gsap";
import "../setup-component";

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  vi.clearAllMocks();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

function mockReducedMotion(prefers: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? prefers : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("prefersReducedMotion", () => {
  it("returns false when user prefers normal motion", async () => {
    mockReducedMotion(false);
    const { prefersReducedMotion } = await import("../../src/lib/gsap/animations");
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns true when user prefers reduced motion", async () => {
    mockReducedMotion(true);
    vi.resetModules();
    const { prefersReducedMotion } = await import("../../src/lib/gsap/animations");
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("fadeInUp", () => {
  it("creates animation when reduced motion is off", async () => {
    mockReducedMotion(false);
    vi.resetModules();
    const { fadeInUp } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("div");
    document.body.appendChild(element);

    const tween = fadeInUp(element, 0);

    expect(tween).not.toBeNull();
    expect(tween).toBeDefined();
    tween?.kill();
    document.body.removeChild(element);
  });

  it("skips animation and sets final state when reduced motion is on", async () => {
    mockReducedMotion(true);
    vi.resetModules();
    const { fadeInUp } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("div");
    document.body.appendChild(element);

    const tween = fadeInUp(element, 0);

    expect(tween).toBeNull();
    expect(gsap.getProperty(element, "opacity")).toBe(1);
    expect(gsap.getProperty(element, "y")).toBe(0);
    document.body.removeChild(element);
  });
});

describe("revealData", () => {
  it("creates counter animation when reduced motion is off", async () => {
    mockReducedMotion(false);
    vi.resetModules();
    const { revealData } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("span");
    document.body.appendChild(element);

    const tween = revealData(element, 100, 0.1);

    expect(tween).not.toBeNull();
    tween?.kill();
    document.body.removeChild(element);
  });

  it("sets final value immediately when reduced motion is on", async () => {
    mockReducedMotion(true);
    vi.resetModules();
    const { revealData } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("span");
    document.body.appendChild(element);

    const tween = revealData(element, 42, 1);

    expect(tween).toBeNull();
    expect(element.textContent).toBe("42");
    document.body.removeChild(element);
  });
});

describe("parallaxScroll", () => {
  it("creates parallax tween when reduced motion is off", async () => {
    mockReducedMotion(false);
    vi.resetModules();
    const { parallaxScroll } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("div");
    document.body.appendChild(element);

    const tween = parallaxScroll(element, 0.5);

    expect(tween).not.toBeNull();
    tween?.kill();
    document.body.removeChild(element);
  });

  it("returns null when reduced motion is on", async () => {
    mockReducedMotion(true);
    vi.resetModules();
    const { parallaxScroll } = await import("../../src/lib/gsap/animations");
    const element = document.createElement("div");

    const tween = parallaxScroll(element, 0.5);

    expect(tween).toBeNull();
  });
});

describe("useGSAP", () => {
  it("cleans up animation context on unmount", async () => {
    mockReducedMotion(false);
    vi.resetModules();
    const { useGSAP } = await import("../../src/lib/gsap/useGSAP");
    const element = document.createElement("div");
    document.body.appendChild(element);

    let tweenCreated: gsap.core.Tween | null = null;

    const { unmount } = renderHook(() =>
      useGSAP(() => {
        tweenCreated = gsap.to(element, { opacity: 0.5, duration: 1 });
      })
    );

    expect(tweenCreated).not.toBeNull();
    
    unmount();

    expect(tweenCreated!.isActive()).toBe(false);
    document.body.removeChild(element);
  });

  it("returns a context ref", async () => {
    mockReducedMotion(false);
    vi.resetModules();
    const { useGSAP } = await import("../../src/lib/gsap/useGSAP");

    const { result } = renderHook(() =>
      useGSAP(() => {
        gsap.to({}, { duration: 1 });
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current.current).not.toBeNull();
  });
});
